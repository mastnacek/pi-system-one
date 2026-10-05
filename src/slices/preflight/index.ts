/**
 * Pre-flight slice for pi-system-one.
 * Intercepts incoming user prompts, hands the session's ACTIVE TOOL LIST to the
 * System One classifier (JEV/Clef), and injects the classifier's concrete tool
 * selection into the system prompt — the main model executes the decision,
 * it does not make it.
 *
 * When the debug HUD is enabled (/system-one debug on), every round-trip —
 * including skipped and failed ones — is published to the widget above the editor.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyToolSelection, decideRoutingOutcome } from "../../shared/classifier.js";
import { publishDebugHud, snapshotFromError, snapshotFromSelection } from "../../shared/debug-hud.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import { collectToolCandidates } from "../../shared/tool-candidates.js";
import type { DebugSnapshot } from "../../shared/types.js";

/**
 * Build the model-facing guideline carrying System One's tool decision.
 * Model-facing text stays English in all locales (see references/multilingual-ui.md).
 */
function buildRoutingGuideline(primaryTool: string, supportingTool: string | undefined, confidence: number): string {
	const chain = supportingTool ? `\`${primaryTool}\` first, then \`${supportingTool}\`` : `\`${primaryTool}\``;
	return (
		`System One tool routing (classifier confidence ${(confidence * 100).toFixed(0)}%): ` +
		`call ${chain}. This tool was selected by the System One classifier from the session's ` +
		`active tool list as the best match for the user's request — prefer it before considering alternatives.`
	);
}

export function registerPreflight(pi: ExtensionAPI, state: PluginState): () => void {
	const unsubscribe = pi.on("before_agent_start", async (event, ctx) => {
		if (!state.config.enabled || state.config.mode !== "auto") {
			return;
		}

		// Skip short prompts (e.g. "yes", "ok", "1") to save latency
		const trimmed = event.prompt.trim();
		if (trimmed.length < 5) {
			return;
		}

		// The session's live tool list is the routing candidate set.
		const tools = collectToolCandidates(pi);

		const publish = (snapshot: DebugSnapshot): void => {
			state.lastDebug = snapshot;
			if (state.config.debugHud) {
				publishDebugHud(ctx, snapshot, state.config.lang);
			}
		};

		if (tools.length === 0) {
			publish({
				source: "preflight",
				timestamp: Date.now(),
				prompt: trimmed,
				candidateCount: 0,
				candidateNames: [],
				questionSummary: "-",
				probabilities: {},
				injected: false,
				skipReason: "no-candidates",
			});
			return;
		}

		try {
			const selection = await classifyToolSelection(ctx.modelRegistry, state.config, trimmed, tools);
			if (!selection) {
				publish(
					snapshotFromSelection(
						"preflight",
						trimmed,
						tools,
						{
							needsTools: false,
							needsToolsProbability: 0,
							confidence: 0,
							probabilities: {},
							metric: { durationMs: 0, costUsd: 0, provider: "-", model: "-" },
						},
						false,
						"classifier-unavailable",
					),
				);
				return;
			}

			state.recordClassification(selection.metric, selection.primaryTool, selection.confidence);

			// Decide whether the guideline is injected (primary-tool sentinel + confidence).
			const outcome = decideRoutingOutcome(selection, state.config.confidenceThreshold);

			publish(
				snapshotFromSelection(
					"preflight",
					trimmed,
					tools,
					selection,
					outcome.injected,
					outcome.skipReason,
				),
			);

			if (!outcome.injected || !outcome.primaryTool) {
				return;
			}

			const s = stringsFor(state.config.lang);

			// 1. Show UI notification if enabled
			if (state.config.showNotification && ctx.hasUI) {
				ctx.ui.notify(
					s.routeNotification(
						outcome.primaryTool,
						outcome.supportingTool,
						outcome.confidence,
						selection.metric.durationMs,
					),
					"info",
				);
			}

			// 2. Inject the concrete tool selection into the system prompt guidelines
			event.systemPromptOptions.promptGuidelines.push(
				buildRoutingGuideline(outcome.primaryTool, outcome.supportingTool, outcome.confidence),
			);
		} catch (err) {
			publish(snapshotFromError("preflight", trimmed, tools, err));
			// Preflight failure must never block or crash the agent turn
			console.error("pi-system-one preflight classification failed:", err);
		}
	});

	return unsubscribe;
}

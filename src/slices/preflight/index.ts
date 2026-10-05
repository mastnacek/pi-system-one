/**
 * Pre-flight slice for pi-system-one.
 * Intercepts incoming user prompts, hands the session's ACTIVE TOOL LIST to the
 * System One classifier (JEV/Clef), and injects the classifier's concrete tool
 * selection into the system prompt — the main model executes the decision,
 * it does not make it.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyToolSelection } from "../../shared/classifier.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import { collectToolCandidates } from "../../shared/tool-candidates.js";

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
		if (tools.length === 0) {
			return;
		}

		try {
			const selection = await classifyToolSelection(ctx.modelRegistry, state.config, trimmed, tools);
			if (!selection) return;

			state.recordClassification(selection.metric, selection.primaryTool, selection.confidence);

			// No tool needed, or the decision is not confident enough — leave the turn untouched.
			if (!selection.needsTools || !selection.primaryTool) {
				return;
			}
			if (selection.confidence < state.config.confidenceThreshold) {
				return;
			}

			const s = stringsFor(state.config.lang);

			// 1. Show UI notification if enabled
			if (state.config.showNotification && ctx.hasUI) {
				ctx.ui.notify(
					s.routeNotification(
						selection.primaryTool,
						selection.supportingTool,
						selection.confidence,
						selection.metric.durationMs,
					),
					"info",
				);
			}

			// 2. Inject the concrete tool selection into the system prompt guidelines
			event.systemPromptOptions.promptGuidelines.push(
				buildRoutingGuideline(selection.primaryTool, selection.supportingTool, selection.confidence),
			);
		} catch (err) {
			// Preflight failure must never block or crash the agent turn
			console.warn("pi-system-one preflight classification failed:", err);
		}
	});

	return unsubscribe;
}

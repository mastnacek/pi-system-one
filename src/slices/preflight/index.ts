/**
 * Pre-flight slice for pi-system-one.
 * Intercepts incoming user prompts, evaluates strategy with JEV/System One,
 * and seamlessly injects domain advisory guidance into the system prompt.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { classifyPromptStrategy } from "../../shared/classifier.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";

const DOMAIN_GUIDELINES: Record<string, string> = {
	lotusscript: "System One: LotusScript/Domino detected. Prioritize LotusScript modular tools, check gotchas, and verify 300-line limits.",
	pi_plugin_dev: "System One: Pi plugin development detected. Follow VSA architecture, string tables, and typebox schemas.",
	herdr_plugin_dev: "System One: Herdr plugin task detected. Follow Herdr VSA conventions and validate manifests.",
	code_navigation: "System One: Code search task detected. Use symbol_search, ast-grep, or LSP navigation for accurate locating.",
	file_editing: "System One: File mutation task detected. Read target context before editing, use exact replacement.",
	bash_shell: "System One: Shell/terminal task detected. Use bash execution and inspect exit codes.",
	web_research: "System One: Web research task detected. Use web_search or google_search for current information.",
	spai_backlog: "System One: SPAI task management detected. Use record_spai_item, update_spai_status, or search_spai_items.",
	general_conversation: "System One: High-level architectural discussion or explanation.",
};

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

		try {
			const route = await classifyPromptStrategy(ctx.modelRegistry, state.config, trimmed);
			if (!route) return;

			state.recordClassification(route.metric, route.domain, route.confidence);

			// Check confidence threshold
			if (route.confidence >= state.config.confidenceThreshold) {
				const s = stringsFor(state.config.lang);

				// 1. Show UI notification if enabled
				if (state.config.showNotification && ctx.hasUI) {
					ctx.ui.notify(
						s.routeNotification(route.domain, route.confidence, route.metric.durationMs),
						"info",
					);
				}

				// 2. Append domain guidance to system prompt guidelines
				const guideline = DOMAIN_GUIDELINES[route.domain] || `System One Strategy: '${route.domain}' recommended.`;
				if (event.systemPromptOptions?.promptGuidelines) {
					event.systemPromptOptions.promptGuidelines.push(guideline);
				}
			}
		} catch (err) {
			// Preflight failure must never block or crash the agent turn
			console.warn("pi-system-one preflight classification failed:", err);
		}
	});

	return unsubscribe;
}

/**
 * Tool candidate collector for pi-system-one.
 * Reads the session's live tool list from the Pi ExtensionAPI and shapes it
 * into classifier-ready candidates (name → short description).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolCandidate } from "./types.js";

/** This plugin's own tools are excluded so the classifier never routes into itself. */
const SELF_PREFIX = "system_one_";

/**
 * Wire-safe cap on choice-criteria size for the classifier.
 * Sized to accommodate rich sessions with multiple MCP servers (90+ tools); a
 * smaller cap silently drops MCP tools and makes them unroutable. Note that
 * `llama-cpp-classify` backends only support 62 choice options, so a session
 * routed to one needs an accordingly smaller active tool set.
 */
const MAX_TOOL_CANDIDATES = 128;

/** Long tool descriptions would blow up the classifier context window. */
const MAX_DESCRIPTION_CHARS = 200;

/**
 * Clean and summarize a tool description for the classifier prompt.
 * MCP tool descriptions are multi-line prose; collapsing whitespace and
 * front-loading the domain keywords keeps the choice criteria legible to a
 * non-conversational classifier (e.g. that the knowledge base covers Lotus Notes).
 */
function cleanToolDescription(name: string, rawDescription?: string): string {
	const text = (rawDescription ?? name).replace(/\s+/g, " ").trim();
	if (name.includes("knowledge_base")) {
		const hint = "Local documentation knowledge base covering Domino/LotusScript (lotus-notes collection), APIs and guides.";
		return `${hint} ${text}`.slice(0, MAX_DESCRIPTION_CHARS);
	}
	return text.slice(0, MAX_DESCRIPTION_CHARS);
}

/**
 * Collect the tools currently declared to the model (`getActiveTools`) with their
 * descriptions (`getAllTools`), excluding this plugin's own tools.
 *
 * Returns [] when the extension runtime is not initialized yet (e.g. load-time calls)
 * instead of throwing — preflight must never block an agent turn.
 */
export function collectToolCandidates(
	pi: Pick<ExtensionAPI, "getActiveTools" | "getAllTools">,
): ToolCandidate[] {
	let activeNames: string[];
	let allTools: ReturnType<ExtensionAPI["getAllTools"]>;
	try {
		activeNames = pi.getActiveTools();
		allTools = pi.getAllTools();
	} catch {
		return [];
	}

	const activeSet = new Set(activeNames);
	return allTools
		.filter((t) => activeSet.has(t.name) && !t.name.startsWith(SELF_PREFIX))
		.slice(0, MAX_TOOL_CANDIDATES)
		.map((t) => ({
			name: t.name,
			description: cleanToolDescription(t.name, t.description),
		}));
}

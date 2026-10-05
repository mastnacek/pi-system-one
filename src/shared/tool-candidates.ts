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
 * Wire-safe cap on choice-criteria size. The typesafe-system-one transport imposes no
 * client-side limit, but llama-cpp-classify supports at most 62 choice options.
 */
const MAX_TOOL_CANDIDATES = 62;

/** Long tool descriptions would blow up the 32K classifier context window. */
const MAX_DESCRIPTION_CHARS = 200;

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
			description: (t.description ?? t.name).slice(0, MAX_DESCRIPTION_CHARS),
		}));
}

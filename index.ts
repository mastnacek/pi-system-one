/**
 * pi-system-one — Pi coding agent extension.
 *
 * Composition root only: registers listeners, wires slices,
 * drains listeners on session_shutdown, and guards against subagent recursion.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createInitialState } from "./src/shared/state.js";
import { registerCommands } from "./src/slices/commands/index.js";
import { registerPreflight } from "./src/slices/preflight/index.js";
import { registerTools } from "./src/slices/tools/index.js";

/** Subagent recursion guard: avoid duplicating hooks in child sessions. */
function isDelegatedSession(): boolean {
	return process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION);
}

export default function (pi: ExtensionAPI): void {
	if (isDelegatedSession()) {
		return;
	}

	const state = createInitialState();
	const unsubscribers: Array<() => void> = [];

	// Wire slices
	registerCommands(pi, state);
	registerTools(pi, state);
	unsubscribers.push(registerPreflight(pi, state));

	// Drain all listeners on session shutdown
	pi.on("session_shutdown", () => {
		while (unsubscribers.length > 0) {
			unsubscribers.pop()?.();
		}
	});
}

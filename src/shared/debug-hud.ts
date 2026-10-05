/**
 * Debug HUD kernel for pi-system-one.
 * Renders one classifier round-trip (what was sent to the System One model and what
 * came back) as a width-safe widget above the editor.
 *
 * The formatter is a pure function (snapshot, strings, width) → lines, so it is
 * unit-testable without a terminal. Widget publishing is isolated behind
 * publishDebugHud/clearDebugHud and never throws into the agent turn.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { stringsFor, type SystemOneStrings } from "./i18n.js";
import type { DebugSnapshot, ToolCandidate, ToolSelectionResult } from "./types.js";

export const DEBUG_WIDGET_KEY = "system-one-debug";

/** Width-safety clamp (references/tui-and-components.md §1): never measure with .length. */
function fitLine(line: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(line) <= maxWidth) return line;
	return truncateToWidth(line, maxWidth, "…");
}

function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Top-N entries of a probability map, formatted as "name .62". */
function formatTopProbabilities(probabilities: Record<string, number>, topN: number): string {
	return Object.entries(probabilities)
		.sort((a, b) => b[1] - a[1])
		.slice(0, topN)
		.map(([name, p]) => `${name} ${p.toFixed(2).replace(/^0/, "")}`)
		.join(" · ");
}

/**
 * Build a debug snapshot from a completed tool-selection round-trip.
 */
export function snapshotFromSelection(
	source: DebugSnapshot["source"],
	prompt: string,
	tools: ToolCandidate[],
	selection: ToolSelectionResult,
	injected: boolean,
	skipReason?: DebugSnapshot["skipReason"],
): DebugSnapshot {
	const choiceSize = tools.length + 1; // tool candidates + sentinel option
	return {
		source,
		timestamp: Date.now(),
		prompt,
		candidateCount: tools.length,
		candidateNames: tools.map((t) => t.name),
		questionSummary: `needs_tools(bool) · primary_tool(choice/${choiceSize}) · supporting_tool(choice/${choiceSize})`,
		needsToolsProbability: selection.needsToolsProbability,
		primaryTool: selection.primaryTool,
		primaryConfidence: selection.confidence,
		supportingTool: selection.supportingTool,
		probabilities: selection.probabilities,
		injected,
		skipReason,
		metric: selection.metric,
	};
}

/** Build a debug snapshot for a failed round-trip. */
export function snapshotFromError(
	source: DebugSnapshot["source"],
	prompt: string,
	tools: ToolCandidate[],
	error: unknown,
): DebugSnapshot {
	return {
		source,
		timestamp: Date.now(),
		prompt,
		candidateCount: tools.length,
		candidateNames: tools.map((t) => t.name),
		questionSummary: "-",
		probabilities: {},
		injected: false,
		skipReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
	};
}

/**
 * Pure renderer: one snapshot → width-clamped widget lines.
 */
export function formatDebugHudLines(
	snapshot: DebugSnapshot,
	s: SystemOneStrings,
	width: number,
): string[] {
	const h = s.hud;
	const lines: string[] = [];

	const model = snapshot.metric ? `${snapshot.metric.provider}/${snapshot.metric.model}` : "-";
	lines.push(`⚖ ${h.title} · ${model} · ${snapshot.source} · ${formatTimestamp(snapshot.timestamp)}`);

	lines.push(`${h.inPrompt} (${snapshot.prompt.length}): "${snapshot.prompt}"`);
	const names = snapshot.candidateNames.join(", ");
	lines.push(`${h.inTools} (${snapshot.candidateCount}): ${names}`);
	lines.push(`${h.inQuestions}: ${snapshot.questionSummary}`);

	if (snapshot.skipReason === "error") {
		lines.push(`${h.out}: ${h.error(snapshot.errorMessage ?? "unknown")}`);
	} else {
		const needs =
			snapshot.needsToolsProbability !== undefined
				? `${h.needs}=${snapshot.needsToolsProbability.toFixed(2)}`
				: undefined;
		const primary = snapshot.primaryTool
			? `${h.primary}=${snapshot.primaryTool} (${((snapshot.primaryConfidence ?? 0) * 100).toFixed(0)}%)`
			: `${h.primary}=—`;
		const supporting = snapshot.supportingTool ? `${h.support}=${snapshot.supportingTool}` : undefined;
		lines.push(`${h.out}: ${[needs, primary, supporting].filter(Boolean).join("  ")}`);

		const top = formatTopProbabilities(snapshot.probabilities, 3);
		if (top) lines.push(`${h.out} p: ${top}`);
	}

	let action: string;
	if (snapshot.injected) {
		action = h.actionInjected;
	} else if (snapshot.skipReason === "no-tool-needed") {
		action = h.actionSkippedNoTool;
	} else if (snapshot.skipReason === "below-threshold") {
		action = h.actionSkippedThreshold;
	} else if (snapshot.skipReason === "classifier-unavailable") {
		action = h.actionSkippedNoClassifier;
	} else if (snapshot.skipReason === "no-candidates") {
		action = h.actionSkippedNoCandidates;
	} else if (snapshot.skipReason === "error") {
		action = h.actionError;
	} else {
		action = h.actionInjectedNo;
	}

	const timing = snapshot.metric ? ` · ${snapshot.metric.durationMs}ms · $${snapshot.metric.costUsd.toFixed(6)}` : "";
	lines.push(`${h.act}: ${action}${timing}`);

	return lines.map((line) => fitLine(line, width));
}

/**
 * Show or refresh the debug HUD widget. No-op without a UI; never throws.
 */
export function publishDebugHud(ctx: ExtensionContext, snapshot: DebugSnapshot, lang: string): void {
	if (!ctx.hasUI) return;
	try {
		ctx.ui.setWidget(
			DEBUG_WIDGET_KEY,
			() => ({
				render(width: number): string[] {
					return formatDebugHudLines(snapshot, stringsFor(lang), width);
				},
				invalidate(): void {
					// Stateless renderer — nothing to invalidate.
				},
			}),
			{ placement: "aboveEditor" },
		);
	} catch {
		// Widget publishing is best-effort; never break the turn over a HUD.
	}
}

/** Remove the debug HUD widget. */
export function clearDebugHud(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	try {
		ctx.ui.setWidget(DEBUG_WIDGET_KEY, undefined);
	} catch {
		// best-effort
	}
}

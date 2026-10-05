import test from "node:test";
import assert from "node:assert/strict";
import {
	formatDebugHudLines,
	snapshotFromError,
	snapshotFromSelection,
} from "../src/shared/debug-hud.js";
import { stringsFor } from "../src/shared/i18n.js";
import type { ToolCandidate, ToolSelectionResult } from "../src/shared/types.js";
import { visibleWidth } from "@earendil-works/pi-tui";

// Fixture data — model-facing classifier criteria, not UI copy (kept in constants so the
// i18n auditor does not mistake test fixtures for hardcoded user-facing text).
const DESC_KB = "Hybrid search over the knowledge base";
const DESC_READ = "Read file contents";
const DESC_BASH = "Execute a shell command";

const TOOLS: ToolCandidate[] = [
	{ name: "kb_search", description: DESC_KB },
	{ name: "read", description: DESC_READ },
	{ name: "bash", description: DESC_BASH },
];

function makeSelection(overrides: Partial<ToolSelectionResult> = {}): ToolSelectionResult {
	return {
		needsTools: true,
		needsToolsProbability: 0.97,
		primaryTool: "kb_search",
		supportingTool: "read",
		confidence: 0.9,
		probabilities: { kb_search: 0.62, read: 0.21, bash: 0.11 },
		metric: { durationMs: 320, costUsd: 0.000014, provider: "openrouter", model: "typesafe/jev-1.13" },
		...overrides,
	};
}

test("debug HUD shows what was sent to the classifier and what it selected", () => {
	const snapshot = snapshotFromSelection(
		"preflight",
		"How do I create a messagebox in LotusScript?",
		TOOLS,
		makeSelection(),
		true,
	);

	const lines = formatDebugHudLines(snapshot, stringsFor("en"), 120);
	const joined = lines.join("\n");

	// IN: what the plugin provides to the model
	assert.ok(joined.includes("How do I create a messagebox in LotusScript?"), "prompt is shown");
	assert.ok(joined.includes("kb_search, read, bash"), "candidate tool list is shown");
	assert.ok(joined.includes("primary_tool(choice/4)"), "question summary shows criteria size (3 tools + sentinel)");

	// OUT: what the model selected
	assert.ok(joined.includes("kb_search"), "selected primary tool is shown");
	assert.ok(joined.includes("read"), "supporting tool is shown");
	assert.ok(joined.includes("90%"), "confidence is shown");
	assert.ok(joined.includes(".62"), "top probabilities are shown");

	// ACT + cost/latency
	assert.ok(joined.includes("injected"), "injection decision is shown");
	assert.ok(joined.includes("320ms"), "latency is shown");
	assert.ok(joined.includes("openrouter/typesafe/jev-1.13"), "model identity is shown");
});

test("debug HUD marks skipped decisions with their reason", () => {
	const snapshot = snapshotFromSelection(
		"preflight",
		"hello there",
		TOOLS,
		makeSelection({ needsTools: false, needsToolsProbability: 0.02, primaryTool: undefined, supportingTool: undefined, confidence: 0 }),
		false,
		"no-tool-needed",
	);

	const joined = formatDebugHudLines(snapshot, stringsFor("en"), 120).join("\n");
	assert.ok(joined.includes("no tool needed"));
	assert.ok(!joined.includes("injected ✓"));
});

test("debug HUD renders errors without throwing", () => {
	const snapshot = snapshotFromError("test", "anything", TOOLS, new Error("No System One classifier model found in registry."));
	const joined = formatDebugHudLines(snapshot, stringsFor("cs"), 120).join("\n");
	assert.ok(joined.includes("chyba:"));
	assert.ok(joined.includes("No System One classifier model found"));
});

test("debug HUD never exceeds the given terminal width (crash protection)", () => {
	const snapshot = snapshotFromSelection(
		"preflight",
		"A very long prompt that will definitely overflow a narrow terminal window when rendered in the widget ".repeat(4),
		TOOLS,
		makeSelection(),
		true,
	);

	for (const width of [40, 60, 80]) {
		const lines = formatDebugHudLines(snapshot, stringsFor("en"), width);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= width, `line exceeds width ${width}: "${line}"`);
		}
	}
});

test("debug HUD lines are localized", () => {
	const snapshot = snapshotFromSelection("test", "příklad", TOOLS, makeSelection(), true);
	const csJoined = formatDebugHudLines(snapshot, stringsFor("cs"), 120).join("\n");
	assert.ok(csJoined.includes("nástroje"));
	assert.ok(csJoined.includes("vložena do promptu"));
});

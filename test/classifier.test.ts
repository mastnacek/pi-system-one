import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolSelection, decideRoutingOutcome, NO_SUPPORTING_TOOL_KEY, NO_TOOL_KEY } from "../src/shared/classifier.js";
import { getDefaultConfig } from "../src/shared/config.js";
import { collectToolCandidates } from "../src/shared/tool-candidates.js";

function createMockRegistry(answers: Record<string, any>, captured?: { context?: any }) {
	const mockModel = {
		type: "classifier",
		id: "typesafe/jev-1.13",
		provider: "openrouter",
		api: "typesafe-system-one",
	};
	return {
		findOfType(type: string) {
			return type === "classifier" ? mockModel : undefined;
		},
		getModelsOfType(type: string) {
			return type === "classifier" ? [mockModel] : [];
		},
		async classify(_model: any, context: any) {
			if (captured) captured.context = context;
			return {
				api: "typesafe-system-one",
				provider: "openrouter",
				model: "typesafe/jev-1.13",
				answers,
				stopReason: "stop",
				timestamp: Date.now(),
				usage: { cost: { total: 0.00001 } },
			};
		},
	} as any;
}

const TOOLS = [
	{ name: "kb_search", description: "Hybrid search over the knowledge base" },
	{ name: "read", description: "Read file contents" },
	{ name: "bash", description: "Execute a shell command" },
];

test("config defaults have valid routing settings", () => {
	const cfg = getDefaultConfig();
	assert.equal(cfg.enabled, true);
	assert.equal(cfg.mode, "auto");
	assert.ok(cfg.confidenceThreshold >= 0.5 && cfg.confidenceThreshold <= 1.0);
	assert.ok(cfg.preferredModel.length > 0);
});

test("classifyToolSelection passes the tool list into the classifier prompt as choice criteria", async () => {
	const captured: { context?: any } = {};
	const registry = createMockRegistry(
		{
			needs_tools: { type: "bool", probability: 0.98 },
			primary_tool: { type: "choice", choice: "kb_search", probabilities: { kb_search: 0.9 }, confidence: 0.9 },
			supporting_tool: { type: "choice", choice: NO_SUPPORTING_TOOL_KEY, probabilities: { none: 1 }, confidence: 0.95 },
		},
		captured,
	);

	const res = await classifyToolSelection(registry, getDefaultConfig(), "How do I create a messagebox in LotusScript?", TOOLS);

	assert.ok(res);
	assert.equal(res.needsTools, true);
	assert.equal(res.primaryTool, "kb_search");
	assert.equal(res.supportingTool, undefined);
	assert.equal(res.confidence, 0.9);

	// The tool list must reach the classifier prompt verbatim, plus the sentinel options.
	const primaryCriteria = captured.context.questions.primary_tool.criteria;
	assert.equal(primaryCriteria.kb_search, "Hybrid search over the knowledge base");
	assert.equal(primaryCriteria.read, "Read file contents");
	assert.ok(primaryCriteria[NO_TOOL_KEY]);
	assert.ok(captured.context.questions.supporting_tool.criteria[NO_SUPPORTING_TOOL_KEY]);
	assert.equal(captured.context.state.prompt, "How do I create a messagebox in LotusScript?");
});

test("classifyToolSelection maps the answer_directly sentinel to no primary tool", async () => {
	const registry = createMockRegistry({
		needs_tools: { type: "bool", probability: 0.05 },
		primary_tool: { type: "choice", choice: NO_TOOL_KEY, probabilities: { [NO_TOOL_KEY]: 0.99 }, confidence: 0.99 },
		supporting_tool: { type: "choice", choice: NO_SUPPORTING_TOOL_KEY, probabilities: { none: 1 }, confidence: 0.9 },
	});

	const res = await classifyToolSelection(registry, getDefaultConfig(), "What does the zip() function do in Python?", TOOLS);

	assert.ok(res);
	assert.equal(res.needsTools, false);
	assert.equal(res.primaryTool, undefined);
	assert.equal(res.supportingTool, undefined);
});

test("classifyToolSelection never returns the primary tool as its own supporting tool", async () => {
	const registry = createMockRegistry({
		needs_tools: { type: "bool", probability: 0.9 },
		primary_tool: { type: "choice", choice: "read", probabilities: { read: 0.8 }, confidence: 0.8 },
		supporting_tool: { type: "choice", choice: "read", probabilities: { read: 0.7 }, confidence: 0.7 },
	});

	const res = await classifyToolSelection(registry, getDefaultConfig(), "Show me package.json", TOOLS);
	assert.ok(res);
	assert.equal(res.primaryTool, "read");
	assert.equal(res.supportingTool, undefined);
});

test("classifyToolSelection returns undefined when no tools are offered", async () => {
	const registry = createMockRegistry({});
	const res = await classifyToolSelection(registry, getDefaultConfig(), "anything", []);
	assert.equal(res, undefined);
});

test("collectToolCandidates keeps only active tools and excludes system_one_* tools", () => {
	const pi = {
		getActiveTools: () => ["read", "bash", "system_one_status"],
		getAllTools: () => [
			{ name: "read", description: "Read a file" },
			{ name: "bash", description: "Run shell commands" },
			{ name: "system_one_status", description: "Own status tool" },
			{ name: "inactive_tool", description: "Not declared to the model" },
		],
	};

	const candidates = collectToolCandidates(pi as any);
	assert.deepEqual(
		candidates.map((c) => c.name),
		["read", "bash"],
	);
});

test("decideRoutingOutcome injects on a confident primary tool even when needs_tools is low", () => {
	// Measured JEV behaviour on a documentation prompt: needs_tools is conservative (0.46)
	// while primary_tool is certain (0.91). Gating on the bool suppressed valid routing.
	const selection = {
		needsTools: false,
		needsToolsProbability: 0.46,
		primaryTool: "mcp__knowledge_base__kb_search",
		supportingTool: "mcp__knowledge_base__kb_read_source",
		confidence: 0.91,
		probabilities: { "mcp__knowledge_base__kb_search": 0.91 },
		metric: { durationMs: 300, costUsd: 0.00002, provider: "openrouter", model: "typesafe/jev-1.13" },
	};

	const outcome = decideRoutingOutcome(selection, 0.65);
	assert.equal(outcome.injected, true);
	assert.equal(outcome.skipReason, undefined);
	assert.equal(outcome.primaryTool, "mcp__knowledge_base__kb_search");
	assert.equal(outcome.supportingTool, "mcp__knowledge_base__kb_read_source");
});

test("decideRoutingOutcome skips uncertain picks and the answer_directly sentinel", () => {
	const base = {
		needsTools: true,
		needsToolsProbability: 0.9,
		primaryTool: "kb_search" as string | undefined,
		supportingTool: undefined,
		confidence: 0.45,
		probabilities: { kb_search: 0.45 },
		metric: { durationMs: 250, costUsd: 0.00001, provider: "openrouter", model: "typesafe/jev-1.13" },
	};

	const uncertain = decideRoutingOutcome(base, 0.65);
	assert.equal(uncertain.injected, false);
	assert.equal(uncertain.skipReason, "below-threshold");

	const direct = decideRoutingOutcome({ ...base, primaryTool: undefined, confidence: 0 }, 0.65);
	assert.equal(direct.injected, false);
	assert.equal(direct.skipReason, "no-tool-needed");
});

test("collectToolCandidates returns [] instead of throwing when the runtime is not initialized", () => {
	const pi = {
		getActiveTools: () => {
			throw new Error("Extension runtime not initialized");
		},
		getAllTools: () => [],
	};
	assert.deepEqual(collectToolCandidates(pi as any), []);
});

test("collectToolCandidates keeps MCP tools in a large session (regression: kb tools must be routable)", () => {
	// Mirror a real 92-tool session: built-ins first, MCP servers appended last — the exact
	// layout a fixed-size slice used to truncate, silently making kb_search unroutable.
	const builtIns = Array.from({ length: 60 }, (_, i) => `builtin_${i}`);
	const mcpNames = [
		"mcp__lotusscript_lsp__lsp_symbols",
		"mcp__knowledge_base__kb_search",
		"mcp__knowledge_base__kb_read_source",
		"mcp__neo4j_veba__read_neo4j_cypher",
	];
	const tail = Array.from({ length: 28 }, (_, i) => `mcp__other__tool_${i}`);
	const all = [...builtIns, ...mcpNames, ...tail];

	const pi = {
		getActiveTools: () => all,
		getAllTools: () => all.map((name) => ({ name, description: `${name}\n\n\tdescription` })),
	};

	const candidates = collectToolCandidates(pi as any);
	const names = candidates.map((c) => c.name);

	assert.equal(candidates.length, all.length, "every active tool is offered");
	assert.ok(names.includes("mcp__knowledge_base__kb_search"), "kb_search survives a 92-tool session");
	assert.ok(names.includes("mcp__lotusscript_lsp__lsp_symbols"));
	assert.ok(names.includes("mcp__knowledge_base__kb_read_source"));

	// The knowledge base candidate carries the Domino/LotusScript domain hint so the
	// classifier can route documentation questions to the lotus-notes collection.
	const kb = candidates.find((c) => c.name === "mcp__knowledge_base__kb_search");
	assert.ok(kb);
	assert.ok(kb.description.includes("LotusScript"), "kb description names the LotusScript domain");
	assert.ok(!kb.description.includes("\n"), "descriptions are collapsed to a single line");
});

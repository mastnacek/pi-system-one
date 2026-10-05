import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolSelection, NO_SUPPORTING_TOOL_KEY, NO_TOOL_KEY } from "../src/shared/classifier.js";
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

test("collectToolCandidates returns [] instead of throwing when the runtime is not initialized", () => {
	const pi = {
		getActiveTools: () => {
			throw new Error("Extension runtime not initialized");
		},
		getAllTools: () => [],
	};
	assert.deepEqual(collectToolCandidates(pi as any), []);
});

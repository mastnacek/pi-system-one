import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInitialState } from "../src/shared/state.js";
import { registerTools } from "../src/slices/tools/index.js";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";

function createMockExtensionAPI() {
	const tools = new Map<string, any>();
	const api = {
		registerTool(def: any) {
			tools.set(def.name, def);
		},
		on() {
			return () => {};
		},
	} as unknown as ExtensionAPI;

	return { api, tools };
}

function createMockToolContext(classifyResponse?: any): ExtensionToolContext {
	const mockModel = {
		type: "classifier",
		id: "typesafe/jev-1.13",
		provider: "openrouter",
		api: "typesafe-system-one",
	};

	const mockRegistry = {
		findOfType(type: string, provider: string, modelId: string) {
			if (type === "classifier") return mockModel;
			return undefined;
		},
		getModelsOfType(type: string) {
			if (type === "classifier") return [mockModel];
			return [];
		},
		async classify(model: any, context: any, options?: any) {
			if (classifyResponse) {
				return typeof classifyResponse === "function" ? classifyResponse(model, context, options) : classifyResponse;
			}
			// Default mock classification result
			const answers: Record<string, any> = {};
			for (const [qId, qDef] of Object.entries<any>(context.questions || {})) {
				if (qDef.type === "choice") {
					const firstChoice = Object.keys(qDef.criteria || {})[0] ?? "default";
					answers[qId] = {
						type: "choice",
						choice: firstChoice,
						confidence: 0.95,
						probabilities: { [firstChoice]: 0.95 },
					};
				} else if (qDef.type === "bool") {
					answers[qId] = {
						type: "bool",
						value: true,
						probability: 0.9,
					};
				} else if (qDef.type === "score") {
					answers[qId] = {
						type: "score",
						score: 3,
					};
				}
			}

			return {
				api: "typesafe-system-one",
				provider: model.provider,
				model: model.id,
				answers,
				stopReason: "stop",
				timestamp: Date.now(),
				usage: {
					input: 100,
					output: 10,
					totalTokens: 110,
					cost: { input: 0.00001, output: 0, total: 0.00001 },
				},
			};
		},
	};

	return {
		modelRegistry: mockRegistry,
	} as unknown as ExtensionToolContext;
}

test("registerTools registers all 4 tools", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-tools-"));
	const { api, tools } = createMockExtensionAPI();
	const state = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	registerTools(api, state);

	assert.ok(tools.has("system_one_classify"));
	assert.ok(tools.has("system_one_route"));
	assert.ok(tools.has("system_one_safety"));
	assert.ok(tools.has("system_one_status"));
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("system_one_status executes without error", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-tools-"));
	const { api, tools } = createMockExtensionAPI();
	const state = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	registerTools(api, state);

	const statusTool = tools.get("system_one_status");
	const res = await statusTool.execute("call_1", { action: "status" });
	assert.ok(res.content && res.content.length > 0);
	const data = JSON.parse(res.content[0].text);
	assert.equal(data.enabled, true);
	assert.equal(data.mode, "auto");
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("system_one_classify executes with mock context", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-tools-"));
	const { api, tools } = createMockExtensionAPI();
	const state = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	registerTools(api, state);

	const classifyTool = tools.get("system_one_classify");
	const ctx = createMockToolContext();
	const res = await classifyTool.execute(
		"call_2",
		{
			state: { task: "Check logs" },
			questions: {
				action: {
					type: "choice",
					instructions: "What action?",
					criteria: { view_logs: "View system logs" },
				},
			},
		},
		undefined,
		undefined,
		ctx,
	);

	assert.equal(res.isError, undefined);
	assert.ok(res.details.answers.action);
	assert.equal(res.details.answers.action.choice, "view_logs");
	assert.equal(state.stats.totalClassifications, 1);
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("system_one_route selects the candidate successfully", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-tools-"));
	const { api, tools } = createMockExtensionAPI();
	const state = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	registerTools(api, state);

	const routeTool = tools.get("system_one_route");
	const ctx = createMockToolContext();
	const res = await routeTool.execute(
		"call_3",
		{
			task: "Fix a bug in types.ts",
			candidates: {
				edit: "Edit existing file",
				search: "Search for files",
			},
		},
		undefined,
		undefined,
		ctx,
	);

	assert.equal(res.isError, undefined);
	assert.ok(res.details.decision);
	assert.equal(state.stats.totalClassifications, 1);
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("system_one_safety evaluates command correctly", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-tools-"));
	const { api, tools } = createMockExtensionAPI();
	const state = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	registerTools(api, state);

	const safetyTool = tools.get("system_one_safety");
	const ctx = createMockToolContext();
	const res = await safetyTool.execute(
		"call_4",
		{ command: "rm -rf /" },
		undefined,
		undefined,
		ctx,
	);

	assert.equal(res.isError, undefined);
	assert.equal(res.details.isDangerous, true);
	assert.equal(res.details.riskScore, 3);
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

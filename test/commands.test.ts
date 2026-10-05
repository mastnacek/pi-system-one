import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInitialState } from "../src/shared/state.js";
import { registerCommands } from "../src/slices/commands/index.js";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

function createMockExtensionAPI() {
	const commands = new Map<string, any>();
	const api = {
		registerCommand(name: string, def: any) {
			commands.set(name, def);
		},
		getActiveTools() {
			return ["kb_search", "read"];
		},
		getAllTools() {
			return [
				{ name: "kb_search", description: "Hybrid search over the knowledge base" },
				{ name: "read", description: "Read file contents" },
			];
		},
	} as unknown as ExtensionAPI;

	return { api, commands };
}

function createMockCommandContext(notifyMessages: string[] = [], cwd: string = process.cwd()): ExtensionCommandContext {
	return {
		hasUI: true,
		cwd,
		ui: {
			notify(msg: string, type?: string) {
				notifyMessages.push(msg);
			},
		},
		modelRegistry: {
			findOfType() {
				return { type: "classifier", id: "typesafe/jev-1.13", provider: "openrouter" };
			},
			getModelsOfType() {
				return [{ type: "classifier", id: "typesafe/jev-1.13", provider: "openrouter" }];
			},
			async classify(model: any, context: any) {
				return {
					api: "typesafe-system-one",
					provider: "openrouter",
					model: "typesafe/jev-1.13",
					answers: {
						needs_tools: { type: "bool", probability: 0.97 },
						primary_tool: {
							type: "choice",
							choice: "kb_search",
							confidence: 0.9,
							probabilities: { kb_search: 0.9 },
						},
						supporting_tool: {
							type: "choice",
							choice: "read",
							confidence: 0.8,
							probabilities: { read: 0.8 },
						},
					},
					stopReason: "stop",
					timestamp: Date.now(),
					usage: { cost: { total: 0.00001 } },
				};
			},
		},
	} as unknown as ExtensionCommandContext;
}

test("registerCommands registers /system-one and /s1", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	assert.ok(commands.has("system-one"));
	assert.ok(commands.has("s1"));
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("/system-one status displays status notification", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const notifications: string[] = [];
	const ctx = createMockCommandContext(notifications, tmpDir);
	const cmd = commands.get("system-one");

	await cmd.handler("status", ctx);
	assert.equal(notifications.length, 1);
	assert.ok(notifications[0].includes("System One"));
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("/system-one mode changes mode", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const notifications: string[] = [];
	const ctx = createMockCommandContext(notifications, tmpDir);
	const cmd = commands.get("system-one");

	await cmd.handler("mode manual", ctx);
	assert.equal(state.config.mode, "manual");
	assert.ok(notifications[0].includes("manual"));
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("/system-one notify toggles notifications", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const notifications: string[] = [];
	const ctx = createMockCommandContext(notifications, tmpDir);
	const cmd = commands.get("system-one");

	await cmd.handler("notify off", ctx);
	assert.equal(state.config.showNotification, false);
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("/system-one lang changes locale", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const notifications: string[] = [];
	const ctx = createMockCommandContext(notifications, tmpDir);
	const cmd = commands.get("system-one");

	await cmd.handler("lang en", ctx);
	assert.equal(state.config.lang, "en");
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("/system-one test runs test prompt", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const notifications: string[] = [];
	const ctx = createMockCommandContext(notifications, tmpDir);
	const cmd = commands.get("system-one");

	await cmd.handler("test search for authentication symbol", ctx);
	assert.ok(notifications.some((n) => n.includes("kb_search")));
	assert.ok(notifications.some((n) => n.includes("read")));
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("argument completions close on free-form 'test ' inputs to allow Enter submission", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-cmds-"));
	const { api, commands } = createMockExtensionAPI();
	const state = createInitialState(tmpDir);
	registerCommands(api, state);

	const cmd = commands.get("system-one");

	// 1. Partial "te" offers "test "
	const partial = cmd.getArgumentCompletions("te");
	assert.ok(partial && partial.length > 0);
	assert.equal(partial[0].value, "test ");

	// 2. Exact "test" without trailing space offers "test "
	const exact = cmd.getArgumentCompletions("test");
	assert.ok(exact && exact.length > 0);
	assert.equal(exact[0].value, "test ");

	// 3. "test " with trailing space closes autocomplete so Enter submits
	const trailing = cmd.getArgumentCompletions("test ");
	assert.equal(trailing, null);

	// 4. "test with prompt" returns null so user can type and submit
	const withPrompt = cmd.getArgumentCompletions("test how to do x");
	assert.equal(withPrompt, null);

	// 5. "mode " returns mode options
	const modeCompletions = cmd.getArgumentCompletions("mode ");
	assert.ok(modeCompletions && modeCompletions.length === 3);

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

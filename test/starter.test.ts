import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInitialState } from "../src/shared/state.js";

test("state kernel initializes with defaults and updates correctly", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sys1-starter-"));
	const st = createInitialState(tmpDir, path.join(tmpDir, "global-pi-system-one.json"));
	assert.equal(st.config.enabled, true);
	assert.equal(st.config.mode, "auto");
	assert.equal(st.stats.totalClassifications, 0);

	st.recordClassification({ durationMs: 250, costUsd: 0.00002, provider: "openrouter", model: "typesafe/jev-1.13" }, "code_navigation", 0.95);
	assert.equal(st.stats.totalClassifications, 1);
	assert.equal(st.stats.totalLatencyMs, 250);
	assert.equal(st.stats.lastDomainChosen, "code_navigation");
	assert.equal(st.stats.lastConfidence, 0.95);

	st.resetStats();
	assert.equal(st.stats.totalClassifications, 0);
	assert.equal(st.stats.totalLatencyMs, 0);
	assert.equal(st.stats.lastDomainChosen, undefined);

	fs.rmSync(tmpDir, { recursive: true, force: true });
});

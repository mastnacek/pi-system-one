import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DOMAINS } from "../src/shared/classifier.js";
import { getDefaultConfig } from "../src/shared/config.js";

test("default domains map contains required system categories", () => {
	const domains = Object.keys(DEFAULT_DOMAINS);
	assert.ok(domains.includes("lotusscript"));
	assert.ok(domains.includes("pi_plugin_dev"));
	assert.ok(domains.includes("herdr_plugin_dev"));
	assert.ok(domains.includes("code_navigation"));
	assert.ok(domains.includes("file_editing"));
	assert.ok(domains.includes("bash_shell"));
	assert.ok(domains.includes("web_research"));
	assert.ok(domains.includes("spai_backlog"));
});

test("config defaults have valid routing settings", () => {
	const cfg = getDefaultConfig();
	assert.equal(cfg.enabled, true);
	assert.equal(cfg.mode, "auto");
	assert.ok(cfg.confidenceThreshold >= 0.5 && cfg.confidenceThreshold <= 1.0);
	assert.ok(cfg.preferredModel.length > 0);
});

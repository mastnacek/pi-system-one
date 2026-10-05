import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCALE, LOCALES, normalizeLocale, stringsFor } from "../src/shared/i18n.js";

test("every locale has a complete string table", () => {
	for (const locale of LOCALES) {
		const s = stringsFor(locale);
		assert.equal(typeof s.title, "string");
		assert.equal(typeof s.ready, "string");
		assert.equal(typeof s.statusHeader, "string");
		assert.equal(typeof s.statusMode("auto"), "string");
		assert.equal(typeof s.statusModel("openrouter", "typesafe/jev-1.13"), "string");
		assert.equal(typeof s.statusStats(10, 0.001, 250), "string");
		assert.equal(typeof s.modeChanged("auto"), "string");
		assert.equal(typeof s.notifyToggled(true), "string");
		assert.equal(typeof s.langChanged("cs"), "string");
		assert.equal(typeof s.statsReset, "string");
		assert.equal(typeof s.testRunning, "string");
		assert.equal(typeof s.testToolsResult("kb_search", "read", 0.9, 200, 0.0001), "string");
		assert.equal(typeof s.testToolsResult("kb_search", undefined, 0.9, 200, 0.0001), "string");
		assert.equal(typeof s.testNoTools(0.9, 200, 0.0001), "string");
		assert.equal(typeof s.testError("failed"), "string");
		assert.equal(typeof s.noClassifierFound, "string");
		assert.equal(typeof s.routeNotification("kb_search", "read", 0.85, 220), "string");
		assert.equal(typeof s.routeNotification("kb_search", undefined, 0.85, 220), "string");
		assert.equal(typeof s.debugToggled(true), "string");
		assert.equal(typeof s.usageMode, "string");
		assert.equal(typeof s.usageNotify, "string");
		assert.equal(typeof s.usageStats, "string");
		assert.equal(typeof s.usageLang, "string");
		assert.equal(typeof s.usageDebug, "string");
		assert.equal(typeof s.helpText, "string");

		assert.equal(typeof s.hud.title, "string");
		assert.equal(typeof s.hud.inPrompt, "string");
		assert.equal(typeof s.hud.inTools, "string");
		assert.equal(typeof s.hud.inQuestions, "string");
		assert.equal(typeof s.hud.out, "string");
		assert.equal(typeof s.hud.act, "string");
		assert.equal(typeof s.hud.needs, "string");
		assert.equal(typeof s.hud.primary, "string");
		assert.equal(typeof s.hud.support, "string");
		assert.equal(typeof s.hud.actionInjected, "string");
		assert.equal(typeof s.hud.actionInjectedNo, "string");
		assert.equal(typeof s.hud.actionSkippedNoTool, "string");
		assert.equal(typeof s.hud.actionSkippedThreshold, "string");
		assert.equal(typeof s.hud.actionSkippedNoClassifier, "string");
		assert.equal(typeof s.hud.actionSkippedNoCandidates, "string");
		assert.equal(typeof s.hud.actionError, "string");
		assert.equal(typeof s.hud.error("boom"), "string");

		assert.equal(typeof s.cmdDesc.root, "string");
		assert.equal(typeof s.cmdDesc.status, "string");
		assert.equal(typeof s.cmdDesc.mode, "string");
		assert.equal(typeof s.cmdDesc.notify, "string");
		assert.equal(typeof s.cmdDesc.test, "string");
		assert.equal(typeof s.cmdDesc.stats, "string");
		assert.equal(typeof s.cmdDesc.lang, "string");
		assert.equal(typeof s.cmdDesc.debug, "string");
	}
});

test("an unknown locale falls back cleanly", () => {
	assert.equal(normalizeLocale("unknown"), "en");
	assert.equal(normalizeLocale(undefined), "en");
	assert.equal(normalizeLocale("cs"), "cs");
	assert.equal(normalizeLocale("cz"), "cs");
});

test("default locale is set", () => {
	assert.equal(stringsFor(DEFAULT_LOCALE).title, "pi-system-one");
});

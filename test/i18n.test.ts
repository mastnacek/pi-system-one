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
		assert.equal(typeof s.testResult("code_search", 0.9, 200, 0.0001), "string");
		assert.equal(typeof s.testError("failed"), "string");
		assert.equal(typeof s.noClassifierFound, "string");
		assert.equal(typeof s.routeNotification("code_search", 0.85, 220), "string");

		assert.equal(typeof s.cmdDesc.root, "string");
		assert.equal(typeof s.cmdDesc.status, "string");
		assert.equal(typeof s.cmdDesc.mode, "string");
		assert.equal(typeof s.cmdDesc.notify, "string");
		assert.equal(typeof s.cmdDesc.test, "string");
		assert.equal(typeof s.cmdDesc.stats, "string");
		assert.equal(typeof s.cmdDesc.lang, "string");
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

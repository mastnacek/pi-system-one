/**
 * i18n kernel for pi-system-one.
 * Multilingual UI string table (EN / CS).
 * User-facing copy only; model-facing text remains in English.
 */

export const LOCALES = ["en", "cs"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "cs";

export interface SystemOneStrings {
	title: string;
	ready: string;
	statusHeader: string;
	statusMode: (mode: string) => string;
	statusModel: (provider: string, model: string) => string;
	statusStats: (count: number, cost: number, avgMs: number) => string;
	modeChanged: (mode: string) => string;
	notifyToggled: (on: boolean) => string;
	langChanged: (lang: string) => string;
	statsReset: string;
	testRunning: string;
	testResult: (choice: string, confidence: number, durationMs: number, costUsd: number) => string;
	testError: (error: string) => string;
	noClassifierFound: string;
	routeNotification: (domain: string, confidence: number, durationMs: number) => string;
	cmdDesc: {
		root: string;
		status: string;
		mode: string;
		notify: string;
		test: string;
		stats: string;
		lang: string;
	};
}

const STRINGS: Record<Locale, SystemOneStrings> = {
	en: {
		title: "pi-system-one",
		ready: "System One intelligent classifier router is ready.",
		statusHeader: "⚖️ System One Status",
		statusMode: (mode) => `Routing Mode: ${mode}`,
		statusModel: (provider, model) => `Classifier: ${provider}/${model}`,
		statusStats: (count, cost, avgMs) =>
			`Decisions: ${count} | Spend: $${cost.toFixed(5)} | Avg Latency: ${avgMs.toFixed(0)}ms`,
		modeChanged: (mode) => `System One routing mode set to: ${mode}`,
		notifyToggled: (on) => `Pre-flight notifications: ${on ? "ON" : "OFF"}`,
		langChanged: (lang) => `Language changed to: ${lang}`,
		statsReset: "System One statistics have been reset.",
		testRunning: "Running test decision via System One classifier...",
		testResult: (choice, conf, ms, cost) =>
			`🎯 Result: ${choice} (${(conf * 100).toFixed(0)}% conf) in ${ms}ms [Cost: $${cost.toFixed(5)}]`,
		testError: (err) => `❌ Classification failed: ${err}`,
		noClassifierFound: "No supported System One classifier found. Ensure OpenRouter or TypeSafe credentials are configured.",
		routeNotification: (domain, conf, ms) => `⚖️ System One: ${domain} (${(conf * 100).toFixed(0)}%) [${ms}ms]`,
		cmdDesc: {
			root: "System One intelligent classifier and router",
			status: "Show current status, model, and decision statistics",
			mode: "Set routing mode (auto | manual | off)",
			notify: "Toggle pre-flight popup notifications (on | off)",
			test: "Run a live test classification against a prompt",
			stats: "Manage decision statistics (reset)",
			lang: "Switch UI language (en | cs)",
		},
	},
	cs: {
		title: "pi-system-one",
		ready: "Inteligentní klasifikační router System One je připraven.",
		statusHeader: "⚖️ Stav System One",
		statusMode: (mode) => `Režim směrování: ${mode}`,
		statusModel: (provider, model) => `Klasifikátor: ${provider}/${model}`,
		statusStats: (count, cost, avgMs) =>
			`Rozhodnutí: ${count} | Útrata: $${cost.toFixed(5)} | Průměrná latence: ${avgMs.toFixed(0)}ms`,
		modeChanged: (mode) => `Režim směrování System One nastaven na: ${mode}`,
		notifyToggled: (on) => `Pre-flight notifikace: ${on ? "ZAPNUTO" : "VYPNUTO"}`,
		langChanged: (lang) => `Jazyk rozhraní změněn na: ${lang}`,
		statsReset: "Statistiky System One byly resetovány.",
		testRunning: "Spouštím testovací klasifikaci přes System One...",
		testResult: (choice, conf, ms, cost) =>
			`🎯 Výsledek: ${choice} (${(conf * 100).toFixed(0)}% jistota) za ${ms}ms [Cena: $${cost.toFixed(5)}]`,
		testError: (err) => `❌ Klasifikace selhala: ${err}`,
		noClassifierFound: "Nebyl nalezen žádný podporovaný klasifikátor. Zkontrolujte OpenRouter nebo TypeSafe přihlášení.",
		routeNotification: (domain, conf, ms) => `⚖️ System One: ${domain} (${(conf * 100).toFixed(0)}%) [${ms}ms]`,
		cmdDesc: {
			root: "Inteligentní klasifikátor a router System One",
			status: "Zobrazit aktuální stav, model a statistiky rozhodování",
			mode: "Nastavit režim směrování (auto | manual | off)",
			notify: "Přepnout vyskakovací notifikace před během (on | off)",
			test: "Spustit okamžitý test klasifikace na zadaném promptu",
			stats: "Správa statistik rozhodování (reset)",
			lang: "Změnit jazyk rozhraní (en | cs)",
		},
	},
};

export function stringsFor(locale: string | undefined): SystemOneStrings {
	return STRINGS[normalizeLocale(locale)];
}

export function normalizeLocale(raw: string | undefined): Locale {
	const token = (raw ?? "").trim().toLowerCase();
	if (token === "cs" || token === "cz" || token === "cze") return "cs";
	return "en";
}

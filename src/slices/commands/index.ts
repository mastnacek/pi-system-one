/**
 * Commands slice for pi-system-one.
 * Registers the `/system-one` (and `/s1`) slash commands with rich autocompletion.
 * Supports --global flag for persistence cascade.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { classifyPromptStrategy } from "../../shared/classifier.js";
import { LOCALES, normalizeLocale, stringsFor, type Locale } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { RoutingMode } from "../../shared/types.js";

const MODES: readonly RoutingMode[] = ["auto", "manual", "off"] as const;

export function registerCommands(pi: ExtensionAPI, state: PluginState): void {
	const handler = async (args: string, ctx: ExtensionCommandContext) => {
		const s = stringsFor(state.config.lang);
		const rawTokens = args.trim().split(/\s+/).filter(Boolean);
		const isGlobal = rawTokens.includes("--global") || rawTokens.includes("-g");
		const tokens = rawTokens.filter((t) => t !== "--global" && t !== "-g");
		const sub = (tokens[0] ?? "status").toLowerCase();

		if (sub === "status") {
			if (!ctx.hasUI) return;
			const avgMs =
				state.stats.totalClassifications > 0
					? state.stats.totalLatencyMs / state.stats.totalClassifications
					: 0;
			ctx.ui.notify(
				`${s.statusHeader}\n` +
					`${s.statusMode(state.config.mode)}\n` +
					`${s.statusModel(state.config.preferredProvider, state.config.preferredModel)}\n` +
					`${s.statusStats(state.stats.totalClassifications, state.stats.totalCostUsd, avgMs)}`,
				"info",
			);
			return;
		}

		if (sub === "mode") {
			const targetMode = tokens[1]?.toLowerCase() as RoutingMode | undefined;
			if (!targetMode || !MODES.includes(targetMode)) {
				if (ctx.hasUI) {
					ctx.ui.notify(`Usage: /system-one mode <${MODES.join("|")}> [--global]`, "warning");
				}
				return;
			}
			state.updateConfig({ mode: targetMode }, isGlobal, ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(s.modeChanged(targetMode) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "notify") {
			const target = tokens[1]?.toLowerCase();
			if (target !== "on" && target !== "off") {
				if (ctx.hasUI) ctx.ui.notify("Usage: /system-one notify <on|off> [--global]", "warning");
				return;
			}
			const enabled = target === "on";
			state.updateConfig({ showNotification: enabled }, isGlobal, ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(s.notifyToggled(enabled) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "stats") {
			const target = tokens[1]?.toLowerCase();
			if (target === "reset") {
				state.resetStats();
				if (ctx.hasUI) ctx.ui.notify(s.statsReset, "info");
			} else {
				if (ctx.hasUI) ctx.ui.notify("Usage: /system-one stats reset", "warning");
			}
			return;
		}

		if (sub === "lang") {
			const targetLang = tokens[1]?.toLowerCase();
			if (!targetLang || !(LOCALES as readonly string[]).includes(targetLang)) {
				if (ctx.hasUI) {
					ctx.ui.notify(`Usage: /system-one lang <${LOCALES.join("|")}> [--global]`, "warning");
				}
				return;
			}
			const nextLang = normalizeLocale(targetLang);
			state.updateConfig({ lang: nextLang }, isGlobal, ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(s.langChanged(nextLang) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "test") {
			const testPrompt = tokens.slice(1).join(" ") || "Find all occurrences of user auth verification in the codebase";
			if (ctx.hasUI) ctx.ui.notify(s.testRunning, "info");

			try {
				const route = await classifyPromptStrategy(ctx.modelRegistry, state.config, testPrompt);
				if (!route) {
					if (ctx.hasUI) ctx.ui.notify(s.noClassifierFound, "error");
					return;
				}

				state.recordClassification(route.metric, route.domain, route.confidence);
				if (ctx.hasUI) {
					ctx.ui.notify(
						s.testResult(route.domain, route.confidence, route.metric.durationMs, route.metric.costUsd),
						"info",
					);
				}
			} catch (err: any) {
				if (ctx.hasUI) ctx.ui.notify(s.testError(err?.message || String(err)), "error");
			}
			return;
		}

		// Fallback help
		if (ctx.hasUI) {
			ctx.ui.notify(
				`System One Commands:\n` +
					`• /system-one status\n` +
					`• /system-one mode <auto|manual|off> [--global]\n` +
					`• /system-one notify <on|off> [--global]\n` +
					`• /system-one test <prompt>\n` +
					`• /system-one stats reset\n` +
					`• /system-one lang <en|cs> [--global]`,
				"info",
			);
		}
	};

	pi.registerCommand("system-one", {
		description: "System One classifier and routing controller",
		getArgumentCompletions: (prefix: string) => buildCompletions(prefix, state),
		handler,
	});

	pi.registerCommand("s1", {
		description: "Alias for /system-one",
		getArgumentCompletions: (prefix: string) => buildCompletions(prefix, state),
		handler,
	});
}

function buildCompletions(
	prefix: string,
	state: PluginState,
): { value: string; label: string; description: string }[] | null {
	const text = prefix.trimStart();
	const tokens = text.split(/\s+/);
	const head = tokens[0]?.toLowerCase() ?? "";
	const s = stringsFor(state.config.lang);

	// Subcommand completions for mode
	if (head === "mode" || (tokens.length >= 2 && tokens[0]?.toLowerCase() === "mode")) {
		const typed = text.slice("mode".length).trim().toLowerCase();
		return MODES.map((m) => ({
			value: `mode ${m}`,
			label: state.config.mode === m ? `${m} ✓` : m,
			description: `Routing mode: ${m}${state.config.mode === m ? " · ● AKTIVNÍ" : ""}`,
		})).filter((row) => row.value.toLowerCase().startsWith(`mode ${typed}`));
	}

	// Subcommand completions for notify
	if (head === "notify" || (tokens.length >= 2 && tokens[0]?.toLowerCase() === "notify")) {
		const typed = text.slice("notify".length).trim().toLowerCase();
		const opts = ["on", "off"] as const;
		return opts
			.map((o) => {
				const isActive = (o === "on" && state.config.showNotification) || (o === "off" && !state.config.showNotification);
				return {
					value: `notify ${o}`,
					label: isActive ? `${o} ✓` : o,
					description: `Preflight notification: ${o}${isActive ? " · ● AKTIVNÍ" : ""}`,
				};
			})
			.filter((row) => row.value.toLowerCase().startsWith(`notify ${typed}`));
	}

	// Subcommand completions for stats
	if (head === "stats" || (tokens.length >= 2 && tokens[0]?.toLowerCase() === "stats")) {
		return [{ value: "stats reset", label: "reset", description: "Reset classification metrics" }];
	}

	// Subcommand completions for lang
	if (head === "lang" || (tokens.length >= 2 && tokens[0]?.toLowerCase() === "lang")) {
		const typed = text.slice("lang".length).trim().toLowerCase();
		return LOCALES.map((loc) => ({
			value: `lang ${loc}`,
			label: state.config.lang === loc ? `${loc} ✓` : loc,
			description: `Language${state.config.lang === loc ? " · ● AKTIVNÍ" : ""}`,
		})).filter((row) => row.value.toLowerCase().startsWith(`lang ${typed}`));
	}

	// Top-level subcommands
	const rows = [
		{ value: "status", label: "status", description: s.cmdDesc.status },
		{ value: "mode ", label: "mode", description: `${s.cmdDesc.mode} [${state.config.mode}]` },
		{ value: "notify ", label: "notify", description: `${s.cmdDesc.notify} [${state.config.showNotification ? "on" : "off"}]` },
		{ value: "test ", label: "test", description: s.cmdDesc.test },
		{ value: "stats ", label: "stats", description: s.cmdDesc.stats },
		{ value: "lang ", label: "lang", description: `${s.cmdDesc.lang} [${state.config.lang}]` },
	];

	return rows.filter((r) => r.value.toLowerCase().startsWith(head));
}

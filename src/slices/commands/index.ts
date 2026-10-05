/**
 * Commands slice for pi-system-one.
 * Registers the `/system-one` (and `/s1`) slash commands with rich autocompletion.
 * Supports --global flag for persistence cascade.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { classifyToolSelection, decideRoutingOutcome } from "../../shared/classifier.js";
import {
	clearDebugHud,
	publishDebugHud,
	snapshotFromError,
	snapshotFromSelection,
} from "../../shared/debug-hud.js";
import { LOCALES, normalizeLocale, stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import { collectToolCandidates } from "../../shared/tool-candidates.js";
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
					ctx.ui.notify(s.usageMode, "warning");
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
				if (ctx.hasUI) ctx.ui.notify(s.usageNotify, "warning");
				return;
			}
			const enabled = target === "on";
			state.updateConfig({ showNotification: enabled }, isGlobal, ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(s.notifyToggled(enabled) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "debug") {
			const target = tokens[1]?.toLowerCase();
			if (target !== "on" && target !== "off") {
				if (ctx.hasUI) ctx.ui.notify(s.usageDebug, "warning");
				return;
			}
			const enabled = target === "on";
			state.updateConfig({ debugHud: enabled }, isGlobal, ctx.cwd);
			if (enabled) {
				// Show the last round-trip immediately, if one exists.
				if (state.lastDebug) publishDebugHud(ctx, state.lastDebug, state.config.lang);
			} else {
				clearDebugHud(ctx);
			}
			if (ctx.hasUI) ctx.ui.notify(s.debugToggled(enabled) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "stats") {
			const target = tokens[1]?.toLowerCase();
			if (target === "reset") {
				state.resetStats();
				if (ctx.hasUI) ctx.ui.notify(s.statsReset, "info");
			} else {
				if (ctx.hasUI) ctx.ui.notify(s.usageStats, "warning");
			}
			return;
		}

		if (sub === "lang") {
			const targetLang = tokens[1]?.toLowerCase();
			if (!targetLang || !(LOCALES as readonly string[]).includes(targetLang)) {
				if (ctx.hasUI) {
					ctx.ui.notify(s.usageLang, "warning");
				}
				return;
			}
			const nextLang = normalizeLocale(targetLang);
			state.updateConfig({ lang: nextLang }, isGlobal, ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(s.langChanged(nextLang) + (isGlobal ? " (global)" : ""), "info");
			return;
		}

		if (sub === "test") {
			const testPrompt =
				args.trim().slice("test".length).trim() ||
				"Find all occurrences of user auth verification in the codebase";
			if (ctx.hasUI) ctx.ui.notify(s.testRunning, "info");

			try {
				const tools = collectToolCandidates(pi);
				const selection = await classifyToolSelection(ctx.modelRegistry, state.config, testPrompt, tools);
				if (!selection) {
					if (ctx.hasUI) ctx.ui.notify(s.noClassifierFound, "error");
					return;
				}

				state.recordClassification(selection.metric, selection.primaryTool, selection.confidence);

				// Capture the round-trip for the debug HUD. `test` never injects guidelines, but the
				// HUD reports whether the preflight WOULD have injected one, and why not.
				const outcome = decideRoutingOutcome(selection, state.config.confidenceThreshold);
				const snapshot = snapshotFromSelection(
					"test",
					testPrompt,
					tools,
					selection,
					outcome.injected,
					outcome.skipReason,
				);
				state.lastDebug = snapshot;
				if (state.config.debugHud) {
					publishDebugHud(ctx, snapshot, state.config.lang);
				}

				if (ctx.hasUI) {
					if (!selection.needsTools || !selection.primaryTool) {
						ctx.ui.notify(
							s.testNoTools(selection.confidence, selection.metric.durationMs, selection.metric.costUsd),
							"info",
						);
					} else {
						ctx.ui.notify(
							s.testToolsResult(
								selection.primaryTool,
								selection.supportingTool,
								selection.confidence,
								selection.metric.durationMs,
								selection.metric.costUsd,
							),
							"info",
						);
					}
				}
			} catch (err: any) {
				const snapshot = snapshotFromError("test", testPrompt, collectToolCandidates(pi), err);
				state.lastDebug = snapshot;
				if (state.config.debugHud) {
					publishDebugHud(ctx, snapshot, state.config.lang);
				}
				if (ctx.hasUI) ctx.ui.notify(s.testError(err?.message || String(err)), "error");
			}
			return;
		}

		// Fallback help
		if (ctx.hasUI) {
			ctx.ui.notify(s.helpText, "info");
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
	const tokens = text.split(/\s+/).filter(Boolean);
	const trailingSpace = /\s$/.test(prefix);
	const firstToken = tokens[0]?.toLowerCase() ?? "";
	const s = stringsFor(state.config.lang);

	// Free-form subcommands (test takes an arbitrary prompt):
	// As soon as the user typed "test " or has typed words after "test", close completions
	// so Enter key submits the command instead of accepting autocomplete.
	if (firstToken === "test" && (trailingSpace || tokens.length > 1)) {
		return null;
	}

	// 2nd level: mode
	if (firstToken === "mode" && (trailingSpace || tokens.length > 1)) {
		const typed = (tokens.length > 1 ? tokens.slice(1).join(" ") : "").toLowerCase();
		return MODES.map((m) => ({
			value: `mode ${m}`,
			label: state.config.mode === m ? `${m} ✓` : m,
			description: `Routing mode: ${m}${state.config.mode === m ? " · ● AKTIVNÍ" : ""}`,
		})).filter((row) => row.value.toLowerCase().startsWith(`mode ${typed}`));
	}

	// 2nd level: notify
	if (firstToken === "notify" && (trailingSpace || tokens.length > 1)) {
		const typed = (tokens.length > 1 ? tokens.slice(1).join(" ") : "").toLowerCase();
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

	// 2nd level: stats
	if (firstToken === "stats" && (trailingSpace || tokens.length > 1)) {
		const typed = (tokens.length > 1 ? tokens.slice(1).join(" ") : "").toLowerCase();
		return [{ value: "stats reset", label: "reset", description: "Reset classification metrics" }].filter((row) =>
			row.value.toLowerCase().startsWith(`stats ${typed}`),
		);
	}

	// 2nd level: debug
	if (firstToken === "debug" && (trailingSpace || tokens.length > 1)) {
		const typed = (tokens.length > 1 ? tokens.slice(1).join(" ") : "").toLowerCase();
		const opts = ["on", "off"] as const;
		return opts
			.map((o) => {
				const isActive = (o === "on" && state.config.debugHud) || (o === "off" && !state.config.debugHud);
				return {
					value: `debug ${o}`,
					label: isActive ? `${o} ✓` : o,
					description: `Debug HUD: ${o}${isActive ? " · ● AKTIVNÍ" : ""}`,
				};
			})
			.filter((row) => row.value.toLowerCase().startsWith(`debug ${typed}`));
	}

	// 2nd level: lang
	if (firstToken === "lang" && (trailingSpace || tokens.length > 1)) {
		const typed = (tokens.length > 1 ? tokens.slice(1).join(" ") : "").toLowerCase();
		return LOCALES.map((loc) => ({
			value: `lang ${loc}`,
			label: state.config.lang === loc ? `${loc} ✓` : loc,
			description: `Language${state.config.lang === loc ? " · ● AKTIVNÍ" : ""}`,
		})).filter((row) => row.value.toLowerCase().startsWith(`lang ${typed}`));
	}

	// If there are multiple tokens and none of the above subcommands matched, return null
	if (tokens.length > 1) {
		return null;
	}

	// 1st level (top-level subcommands)
	const typed = (tokens[0] ?? "").toLowerCase();
	const rows = [
		{ value: "status", label: "status", description: s.cmdDesc.status },
		{ value: "mode ", label: "mode", description: `${s.cmdDesc.mode} [${state.config.mode}]` },
		{ value: "notify ", label: "notify", description: `${s.cmdDesc.notify} [${state.config.showNotification ? "on" : "off"}]` },
		{ value: "test ", label: "test", description: s.cmdDesc.test },
		{ value: "stats ", label: "stats", description: s.cmdDesc.stats },
		{ value: "lang ", label: "lang", description: `${s.cmdDesc.lang} [${state.config.lang}]` },
		{ value: "debug ", label: "debug", description: `${s.cmdDesc.debug} [${state.config.debugHud ? "on" : "off"}]` },
	];

	const filtered = rows.filter((r) => r.value.trim().toLowerCase().startsWith(typed));
	return filtered.length > 0 ? filtered : null;
}

/**
 * High-performance System One classifier wrapper for JEV, Clef, and Tev1.
 * Resolves models, formats criteria, measures duration/cost, and handles fallbacks.
 */

import type { ClassifierContext, ClassifierModel, ClassifierResult } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ClassificationMetric, StrategyRouteResult, SystemOneConfig } from "./types.js";

export const DEFAULT_DOMAINS: Record<string, string> = {
	lotusscript: "LotusScript, Domino 9.0.1, DXL, Notes databases, agent decompilation/compilation, views, formulas",
	pi_plugin_dev: "Developing Pi coding agent plugins, extensions, skills, slash commands, TUI, or VSA architecture",
	herdr_plugin_dev: "Herdr multiplexer plugin development in Rust/Ratatui, manifest validation, herdr scaffolding",
	code_navigation: "Semantic code search, LSP definitions, symbol search, ast-grep queries, exploring unfamiliar codebases",
	file_editing: "Editing existing code files, precise text replacements, creating new source code files, refactoring",
	bash_shell: "Executing shell commands, git operations, file system checks, running builds, linters, or test suites",
	web_research: "Searching the live web for recent documentation, API changes, news, or external technical docs",
	spai_backlog: "Managing project tasks, backlog items, SPAI syntax, notes, ideas, todo/working/done lifecycle",
	general_conversation: "General software discussion, explaining concepts, architectural design, answering high-level questions",
};

const CLASSIFIER_FALLBACKS = [
	{ provider: "openrouter", model: "typesafe/jev-1.13" },
	{ provider: "openrouter", model: "~typesafe/jev-latest" },
	{ provider: "typesafe", model: "jev-latest" },
	{ provider: "opencode", model: "jev-1.13" },
	{ provider: "opencode", model: "jev-1.13-free" },
	{ provider: "openrouter", model: "cloudflare/clef-flash" },
	{ provider: "openrouter", model: "cloudflare/clef" },
	{ provider: "cloudflare-workers-ai", model: "typesafe/jev" },
];

export function findClassifier(
	registry: ModelRegistry,
	config: SystemOneConfig,
): ClassifierModel<any> | undefined {
	if (config.preferredProvider && config.preferredModel) {
		const candidate = registry.findOfType("classifier", config.preferredProvider, config.preferredModel);
		if (candidate) return candidate;
	}

	for (const fb of CLASSIFIER_FALLBACKS) {
		const candidate = registry.findOfType("classifier", fb.provider, fb.model);
		if (candidate) return candidate;
	}

	const anyAvailable = registry.getModelsOfType("classifier");
	return anyAvailable[0];
}

export async function runClassification(
	registry: ModelRegistry,
	config: SystemOneConfig,
	context: ClassifierContext,
	signal?: AbortSignal,
): Promise<{ result: ClassifierResult; metric: ClassificationMetric }> {
	const model = findClassifier(registry, config);
	if (!model) {
		throw new Error("No System One classifier model found in registry.");
	}

	const startTime = Date.now();
	const result = await registry.classify(model, context, { signal });
	const durationMs = Date.now() - startTime;

	const costUsd = result.usage?.cost?.total ?? 0;
	const metric: ClassificationMetric = {
		durationMs,
		costUsd,
		provider: model.provider,
		model: model.id,
	};

	return { result, metric };
}

export async function classifyPromptStrategy(
	registry: ModelRegistry,
	config: SystemOneConfig,
	prompt: string,
	signal?: AbortSignal,
): Promise<StrategyRouteResult | undefined> {
	const domains = config.domainStrategies ?? DEFAULT_DOMAINS;
	const context: ClassifierContext = {
		state: { prompt: prompt.slice(0, 16_000) },
		questions: {
			domain: {
				type: "choice",
				instructions: "Which domain or toolset is most appropriate for handling the user's prompt?",
				criteria: domains,
			},
		},
	};

	const { result, metric } = await runClassification(registry, config, context, signal);
	if (result.stopReason !== "stop") {
		return undefined;
	}

	const answer = result.answers.domain;
	if (answer.type !== "choice") {
		return undefined;
	}

	return {
		domain: answer.choice,
		confidence: answer.confidence,
		probabilities: answer.probabilities,
		metric,
	};
}

export async function evaluateSafety(
	registry: ModelRegistry,
	config: SystemOneConfig,
	command: string,
	signal?: AbortSignal,
): Promise<{ isDangerous: boolean; riskScore: number; reason: string; metric: ClassificationMetric }> {
	const context: ClassifierContext = {
		state: { command },
		questions: {
			dangerous: {
				type: "bool",
				instructions: "Is this shell/git command potentially destructive, irreversible, or dangerous?",
				criteria: {
					true: "Destructive or dangerous (e.g. rm -rf, git push --force, drop database, hard reset)",
					false: "Safe or non-destructive inspection/build command",
				},
			},
			risk: {
				type: "score",
				instructions: "Rate the operational risk level of executing this command",
				criteria: ["0 = harmless", "1 = low risk", "2 = moderate risk", "3 = high/destructive risk"],
			},
		},
	};

	const { result, metric } = await runClassification(registry, config, context, signal);
	const isDangerous = result.answers.dangerous?.type === "bool" && result.answers.dangerous.probability >= 0.5;
	const riskScore = result.answers.risk?.type === "score" ? result.answers.risk.score : 0;

	return {
		isDangerous,
		riskScore,
		reason: isDangerous ? "Destructive or high-risk command detected" : "Safe command",
		metric,
	};
}

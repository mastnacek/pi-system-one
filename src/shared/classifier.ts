/**
 * High-performance System One classifier wrapper for JEV, Clef, and Tev1.
 * Resolves models, formats criteria, measures duration/cost, and handles fallbacks.
 *
 * The core routing primitive is `classifyToolSelection`: it hands the session's
 * active tool list to the classifier as choice criteria, so System One — not the
 * main model — decides which tool fits the user's request.
 */

import type { ClassifierContext, ClassifierModel, ClassifierResult } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
	ClassificationMetric,
	DebugSkipReason,
	SystemOneConfig,
	ToolCandidate,
	ToolSelectionResult,
} from "./types.js";

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

/** Sentinel choice key: the classifier decides no tool is needed. */
export const NO_TOOL_KEY = "answer_directly";
/** Sentinel choice key: no complementary tool is needed. */
export const NO_SUPPORTING_TOOL_KEY = "none";

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

/**
 * Route a user prompt to the session's tools. The classifier receives the prompt as
 * state and the active tool list as choice criteria, then answers three questions in
 * one call: whether a tool is needed at all, which tool to call first, and which
 * second tool complements it.
 *
 * Returns undefined when no tools are offered or the classifier did not stop cleanly.
 */
export async function classifyToolSelection(
	registry: ModelRegistry,
	config: SystemOneConfig,
	prompt: string,
	tools: ToolCandidate[],
	signal?: AbortSignal,
): Promise<ToolSelectionResult | undefined> {
	if (tools.length === 0) {
		return undefined;
	}

	const toolCriteria: Record<string, string> = {};
	for (const tool of tools) {
		toolCriteria[tool.name] = tool.description;
	}

	const context: ClassifierContext = {
		state: { prompt: prompt.slice(0, 16_000) },
		questions: {
			needs_tools: {
				type: "bool",
				instructions: "Does fulfilling this user request require calling at least one of the available tools?",
				criteria: {
					true: "At least one tool call is needed to fulfill the request (read data, search, edit, run commands)",
					false: "The request can be answered directly from knowledge without any tool call",
				},
			},
			primary_tool: {
				type: "choice",
				instructions:
					"Which single tool should the coding agent call FIRST to best fulfill the user's request? " +
					"For questions about a specific platform, product, API or framework (LotusScript, Domino, Pi, Herdr, ...), " +
					"prefer the tool that retrieves authoritative documentation or source over answering from memory. " +
					`Choose ${NO_TOOL_KEY} only when no listed tool would materially improve the answer.`,
				criteria: {
					[NO_TOOL_KEY]:
						"Answer directly from model knowledge — use only for general concepts that need no project or documentation lookup",
					...toolCriteria,
				},
			},
			supporting_tool: {
				type: "choice",
				instructions:
					"Which second tool best complements the primary tool for this request (e.g. reading docs before editing)? " +
					`Choose ${NO_SUPPORTING_TOOL_KEY} when the primary tool alone suffices.`,
				criteria: {
					[NO_SUPPORTING_TOOL_KEY]: "No supporting tool is needed",
					...toolCriteria,
				},
			},
		},
	};

	const { result, metric } = await runClassification(registry, config, context, signal);
	if (result.stopReason !== "stop") {
		return undefined;
	}

	const needs = result.answers.needs_tools;
	const primary = result.answers.primary_tool;
	const supporting = result.answers.supporting_tool;

	const needsTools = needs?.type === "bool" ? needs.probability >= 0.5 : true;
	const needsToolsProbability = needs?.type === "bool" ? needs.probability : needsTools ? 1 : 0;
	const primaryTool =
		primary?.type === "choice" && primary.choice !== NO_TOOL_KEY ? primary.choice : undefined;
	const confidence = primary?.type === "choice" ? primary.confidence : 0;
	const supportingTool =
		supporting?.type === "choice" &&
		supporting.choice !== NO_SUPPORTING_TOOL_KEY &&
		supporting.choice !== primaryTool
			? supporting.choice
			: undefined;

	return {
		needsTools,
		needsToolsProbability,
		primaryTool,
		supportingTool,
		confidence,
		probabilities: primary?.type === "choice" ? primary.probabilities : {},
		metric,
	};
}

/** The routing outcome for one selection: inject the guideline, or why not. */
export interface RoutingOutcome {
	injected: boolean;
	skipReason?: DebugSkipReason;
	primaryTool?: string;
	supportingTool?: string;
	confidence: number;
}

/**
 * Decide whether a selection becomes an injected guideline.
 *
 * The decision rests on the `primary_tool` choice and its confidence, NOT on the
 * `needs_tools` bool: JEV answers that bool conservatively (measured 0.35–0.46 for
 * prompts whose primary tool scored 0.91), so gating on it suppressed valid routing.
 * The `answer_directly` sentinel already expresses "no tool", and primary confidence
 * is the signal that actually separates certain from uncertain picks. `needs_tools`
 * stays in the result as a diagnostic for the debug HUD.
 */
export function decideRoutingOutcome(selection: ToolSelectionResult, confidenceThreshold: number): RoutingOutcome {
	if (!selection.primaryTool) {
		return { injected: false, skipReason: "no-tool-needed", confidence: selection.confidence };
	}
	if (selection.confidence < confidenceThreshold) {
		return {
			injected: false,
			skipReason: "below-threshold",
			primaryTool: selection.primaryTool,
			supportingTool: selection.supportingTool,
			confidence: selection.confidence,
		};
	}
	return {
		injected: true,
		primaryTool: selection.primaryTool,
		supportingTool: selection.supportingTool,
		confidence: selection.confidence,
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

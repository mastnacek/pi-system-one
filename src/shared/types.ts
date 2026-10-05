/**
 * Core type definitions for pi-system-one.
 * Pure interfaces and data structures shared across all slices.
 */

import type { Locale } from "./i18n.js";

export type RoutingMode = "auto" | "manual" | "off";

export interface SystemOneConfig {
	enabled: boolean;
	mode: RoutingMode;
	lang: Locale;
	/** Preferred classifier model ID or slug */
	preferredModel: string;
	/** Preferred provider (e.g. "openrouter", "typesafe", "opencode", "cloudflare-workers-ai") */
	preferredProvider: string;
	/** Minimum confidence threshold [0.0 - 1.0] to inject pre-flight guidance */
	confidenceThreshold: number;
	/** Whether to show a non-intrusive UI notification on preflight decisions */
	showNotification: boolean;
}

export interface SystemOneStats {
	totalClassifications: number;
	totalCostUsd: number;
	totalLatencyMs: number;
	lastClassificationTimestamp: number;
	lastDomainChosen?: string;
	lastConfidence?: number;
}

export interface ClassificationMetric {
	durationMs: number;
	costUsd: number;
	provider: string;
	model: string;
}

/** One tool offered to the classifier as a routing candidate. */
export interface ToolCandidate {
	name: string;
	description: string;
}

/** Result of System One tool selection over the session's active tool list. */
export interface ToolSelectionResult {
	/** Whether the classifier believes any tool call is needed at all. */
	needsTools: boolean;
	/** The tool the agent should call first (undefined = answer directly). */
	primaryTool?: string;
	/** A complementary second tool, when one was selected. */
	supportingTool?: string;
	/** Confidence of the primary_tool choice [0.0 - 1.0]. */
	confidence: number;
	/** Probability distribution over the primary_tool candidates. */
	probabilities: Record<string, number>;
	metric: ClassificationMetric;
}

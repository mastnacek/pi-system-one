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
	/** Custom domain strategy criteria for preflight classification */
	domainStrategies?: Record<string, string>;
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

export interface StrategyRouteResult {
	domain: string;
	confidence: number;
	probabilities: Record<string, number>;
	metric: ClassificationMetric;
}

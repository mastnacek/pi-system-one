/**
 * Shared state kernel for pi-system-one.
 * Central reactive state store shared across all slices.
 */

import { loadConfig, saveConfig } from "./config.js";
import type { ClassificationMetric, DebugSnapshot, SystemOneConfig, SystemOneStats } from "./types.js";

export interface PluginState {
	config: SystemOneConfig;
	stats: SystemOneStats;
	/** The most recent classifier round-trip, captured for the debug HUD. */
	lastDebug?: DebugSnapshot;
	updateConfig(patch: Partial<SystemOneConfig>, isGlobal?: boolean, cwd?: string): void;
	recordClassification(metric: ClassificationMetric, domain?: string, confidence?: number): void;
	resetStats(): void;
}

export function createInitialState(cwd?: string, globalFile?: string): PluginState {
	const config = loadConfig(cwd, globalFile);
	const stats: SystemOneStats = {
		totalClassifications: 0,
		totalCostUsd: 0,
		totalLatencyMs: 0,
		lastClassificationTimestamp: 0,
	};

	return {
		config,
		stats,
		updateConfig(patch: Partial<SystemOneConfig>, isGlobal: boolean = false, workingDir?: string): void {
			Object.assign(this.config, patch);
			saveConfig(this.config, isGlobal, workingDir, globalFile);
		},
		recordClassification(metric: ClassificationMetric, domain?: string, confidence?: number): void {
			this.stats.totalClassifications += 1;
			this.stats.totalCostUsd += metric.costUsd;
			this.stats.totalLatencyMs += metric.durationMs;
			this.stats.lastClassificationTimestamp = Date.now();
			if (domain) this.stats.lastDomainChosen = domain;
			if (confidence !== undefined) this.stats.lastConfidence = confidence;
		},
		resetStats(): void {
			this.stats.totalClassifications = 0;
			this.stats.totalCostUsd = 0;
			this.stats.totalLatencyMs = 0;
			this.stats.lastDomainChosen = undefined;
			this.stats.lastConfidence = undefined;
		},
	};
}

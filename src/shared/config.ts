/**
 * Configuration persistence for pi-system-one.
 * Follows Global Config Cascade:
 * - global: ~/.pi/agent/pi-system-one.json
 * - project: <cwd>/.pi/pi-system-one.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { SystemOneConfig } from "./types.js";
import { DEFAULT_LOCALE } from "./i18n.js";

const CONFIG_FILE_NAME = "pi-system-one.json";

export function getDefaultConfig(): SystemOneConfig {
	return {
		enabled: true,
		mode: "auto",
		lang: DEFAULT_LOCALE,
		preferredModel: "typesafe/jev-1.13",
		preferredProvider: "openrouter",
		confidenceThreshold: 0.65,
		showNotification: true,
	};
}

export function getGlobalConfigPath(): string {
	const home = os.homedir();
	return path.join(home, ".pi", "agent", CONFIG_FILE_NAME);
}

export function getProjectConfigPath(cwd: string = process.cwd()): string {
	return path.join(cwd, ".pi", CONFIG_FILE_NAME);
}

export function loadConfig(cwd: string = process.cwd()): SystemOneConfig {
	const defaults = getDefaultConfig();
	let globalConfig: Partial<SystemOneConfig> = {};
	let projectConfig: Partial<SystemOneConfig> = {};

	try {
		const gPath = getGlobalConfigPath();
		if (fs.existsSync(gPath)) {
			globalConfig = JSON.parse(fs.readFileSync(gPath, "utf-8"));
		}
	} catch (err) {
		console.warn("pi-system-one: failed to load global config:", err);
	}

	try {
		const pPath = getProjectConfigPath(cwd);
		if (fs.existsSync(pPath)) {
			projectConfig = JSON.parse(fs.readFileSync(pPath, "utf-8"));
		}
	} catch (err) {
		console.warn("pi-system-one: failed to load project config:", err);
	}

	return {
		...defaults,
		...globalConfig,
		...projectConfig,
	};
}

export function saveConfig(config: SystemOneConfig, isGlobal: boolean = false, cwd: string = process.cwd()): void {
	try {
		const filePath = isGlobal ? getGlobalConfigPath() : getProjectConfigPath(cwd);
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
	} catch (err) {
		console.warn("pi-system-one: failed to save config:", err);
	}
}

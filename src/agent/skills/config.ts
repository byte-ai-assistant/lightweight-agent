/**
 * Config loader for per-skill overrides and extra directories
 * Reads from ~/.<project-name>/agent.json with 60s TTL caching
 */

import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { ByteConfig, ByteSkillConfig } from "./types.js";
import { projectName } from "../../lib/project-name.js";

const CONFIG_PATH = path.join(homedir(), `.${projectName()}`, "agent.json");
const CACHE_TTL = 60_000; // 60 seconds

let configCache: { value: ByteConfig; expiresAt: number } | null = null;

/**
 * Load and cache ~/.<project-name>/agent.json
 * Returns empty config if file is missing or invalid
 */
export function loadConfig(): ByteConfig {
  if (configCache && Date.now() < configCache.expiresAt) {
    return configCache.value;
  }

  let config: ByteConfig = {};

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      config = JSON.parse(raw) as ByteConfig;
    }
  } catch (error) {
    console.error(
      `Failed to load config from ${CONFIG_PATH}:`,
      error instanceof Error ? error.message : error
    );
  }

  configCache = { value: config, expiresAt: Date.now() + CACHE_TTL };
  return config;
}

/**
 * Get per-skill config override by skill name
 */
export function getSkillConfig(
  skillName: string,
  config?: ByteConfig
): ByteSkillConfig | undefined {
  const cfg = config ?? loadConfig();
  return cfg.skills?.entries?.[skillName];
}

/**
 * Get extra skill directories from config
 */
export function getExtraDirs(config?: ByteConfig): string[] {
  const cfg = config ?? loadConfig();
  return cfg.skills?.load?.extraDirs ?? [];
}

/**
 * Check if a skill is enabled (default: true if not specified)
 */
export function isSkillEnabled(
  skillName: string,
  config?: ByteConfig
): boolean {
  const cfg = config ?? loadConfig();
  const skillConfig = cfg.skills?.entries?.[skillName];
  return skillConfig?.enabled !== false;
}

/**
 * Look up a config value by key path (dot-notation)
 * Searches skill-specific config, then global config
 */
export function getConfigValue(
  key: string,
  skillName?: string,
  config?: ByteConfig
): any {
  const cfg = config ?? loadConfig();

  // Check skill-specific config first
  if (skillName) {
    const skillConfig = cfg.skills?.entries?.[skillName];
    if (skillConfig?.config?.[key] !== undefined) {
      return skillConfig.config[key];
    }
  }

  // Check if any skill entry has this config key
  const entries = cfg.skills?.entries;
  if (entries) {
    for (const entry of Object.values(entries)) {
      if (entry.config?.[key] !== undefined) {
        return entry.config[key];
      }
    }
  }

  return undefined;
}

/**
 * Resolve a primaryEnv value: check env var first, then config apiKey
 */
export function resolvePrimaryEnv(
  envVar: string,
  skillName?: string,
  config?: ByteConfig
): string | undefined {
  // Direct env var check
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // Fall back to config apiKey lookup
  const cfg = config ?? loadConfig();
  if (skillName) {
    const skillConfig = cfg.skills?.entries?.[skillName];
    if (skillConfig?.apiKey) {
      // Look up the apiKey value from env based on the mapping
      const keyEnv = `${skillConfig.apiKey.provider}_${skillConfig.apiKey.id}`.toUpperCase();
      if (process.env[keyEnv]) {
        return process.env[keyEnv];
      }
    }
  }

  return undefined;
}

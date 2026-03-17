/**
 * Conditional gating logic for skill requirements
 * Checks if environment, binaries, config, and OS requirements are met
 */

import { execSync } from "child_process";
import { platform } from "os";
import { SkillFrontmatter, GatingResult, ByteConfig } from "./types.js";
import { getConfigValue, resolvePrimaryEnv } from "./config.js";

/**
 * Check if all skill requirements are met
 */
export function checkRequirements(
  frontmatter: SkillFrontmatter,
  config?: ByteConfig
): GatingResult {
  const requires = frontmatter.metadata?.openclaw?.requires;

  if (!requires) {
    // No requirements specified - skill is always available
    return { met: true, unmet: [] };
  }

  // always: true — skip all requirement checks
  if (requires.always) {
    return { met: true, unmet: [] };
  }

  const unmet: string[] = [];

  // Check environment variables
  if (requires.env) {
    for (const envVar of requires.env) {
      if (!process.env[envVar]) {
        unmet.push(`env: ${envVar}`);
      }
    }
  }

  // Check primaryEnv — env var or config apiKey fallback
  if (requires.primaryEnv) {
    const resolved = resolvePrimaryEnv(
      requires.primaryEnv,
      frontmatter.name,
      config
    );
    if (!resolved) {
      unmet.push(`env: ${requires.primaryEnv} (primaryEnv)`);
    }
  }

  // Check binaries on PATH (all must exist)
  if (requires.bins) {
    for (const bin of requires.bins) {
      if (!isBinaryAvailable(bin)) {
        unmet.push(`bin: ${bin}`);
      }
    }
  }

  // Check anyBins — at least one must exist
  if (requires.anyBins && requires.anyBins.length > 0) {
    const found = requires.anyBins.some((bin) => isBinaryAvailable(bin));
    if (!found) {
      unmet.push(`bin: none of [${requires.anyBins.join(", ")}]`);
    }
  }

  // Check OS platform
  if (requires.os) {
    const currentPlatform = platform();
    if (!requires.os.includes(currentPlatform)) {
      unmet.push(
        `os: ${currentPlatform} (requires: ${requires.os.join(" or ")})`
      );
    }
  }

  // Check config keys
  if (requires.config) {
    for (const key of requires.config) {
      const value = getConfigValue(key, frontmatter.name, config);
      if (value === undefined) {
        unmet.push(`config: ${key}`);
      }
    }
  }

  return {
    met: unmet.length === 0,
    unmet,
  };
}

/**
 * Check if a binary is available on PATH
 */
function isBinaryAvailable(binaryName: string): boolean {
  try {
    const command = process.platform === "win32" ? "where" : "which";
    execSync(`${command} ${binaryName}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

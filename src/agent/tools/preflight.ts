import { execFile } from "child_process";
import fs from "fs";
import { PREFLIGHT_FILE } from "../../paths.js";

interface PreflightCheck {
  name: string;
  type: "shell";
  command: string;
  expect: "non-zero-output" | "exit-zero" | `regex:${string}`;
}

interface PreflightGate {
  description?: string;
  mode: "any" | "all";
  checks: PreflightCheck[];
  timeoutMs?: number;
}

type PreflightConfig = Record<string, PreflightGate>;

const CACHE_TTL = 60_000;
let cache: { value: PreflightConfig; expiresAt: number } | null = null;

function loadConfig(): PreflightConfig {
  if (cache && Date.now() < cache.expiresAt) return cache.value;
  try {
    if (!fs.existsSync(PREFLIGHT_FILE)) return {};
    const value = JSON.parse(fs.readFileSync(PREFLIGHT_FILE, "utf-8")) as PreflightConfig;
    cache = { value, expiresAt: Date.now() + CACHE_TTL };
    return value;
  } catch (e) {
    process.stderr.write(`[preflight] Failed to load ${PREFLIGHT_FILE}: ${e}\n`);
    return {};
  }
}

function runShellCheck(command: string, expect: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("/bin/sh", ["-c", command], { timeout: timeoutMs }, (err, stdout) => {
      try {
        if (expect === "exit-zero") {
          resolve(!err);
          return;
        }

        if (expect === "non-zero-output") {
          if (err) { resolve(true); return; } // fail-open
          const lines = stdout.trim().split("\n").filter((l) => l.trim());
          if (lines.length === 0) { resolve(false); return; }
          // If all lines are numeric, check if any > 0
          const allNumeric = lines.every((l) => /^\d+$/.test(l.trim()));
          if (allNumeric) {
            resolve(lines.some((l) => parseInt(l.trim(), 10) > 0));
          } else {
            resolve(true); // non-empty, non-numeric output = has content
          }
          return;
        }

        if (expect.startsWith("regex:")) {
          if (err) { resolve(true); return; } // fail-open
          const pattern = new RegExp(expect.slice(6));
          resolve(pattern.test(stdout));
          return;
        }

        resolve(true); // unknown expect rule → fail-open
      } catch {
        resolve(true); // fail-open on any error
      }
    });
  });
}

export async function evaluatePreflightGate(
  cronJobId: string
): Promise<{ shouldRun: boolean; reason: string }> {
  const config = loadConfig();
  const gate = config[cronJobId];

  if (!gate || !gate.checks?.length) {
    return { shouldRun: true, reason: "no gate configured" };
  }

  const timeout = gate.timeoutMs ?? 15_000;
  const start = Date.now();

  const results = await Promise.allSettled(
    gate.checks.map((check) => runShellCheck(check.command, check.expect, timeout))
  );

  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (const r of results) {
    if (r.status === "rejected") {
      errors++;
    } else if (r.value) {
      passed++;
    } else {
      failed++;
    }
  }

  const elapsed = Date.now() - start;
  const shouldRun = gate.mode === "any" ? passed > 0 : failed === 0;
  const decision = shouldRun ? "RUN" : "SKIP";

  const reason = `checks=${results.length} passed=${passed} failed=${failed} errors=${errors} (${elapsed}ms)`;
  process.stderr.write(`[preflight] job=${cronJobId} ${reason} decision=${decision}\n`);

  return { shouldRun, reason };
}

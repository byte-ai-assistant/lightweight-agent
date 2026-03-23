import fs from "fs";
import path from "path";
import { getActiveSessions, getSessionInfo, clearSession } from "./agent/index.js";
import { getActiveCronCount } from "./agent/tools/cron.js";
import {
  getCachedVerifiedAgentEmail,
  getConfiguredAgentEmail,
  getConfiguredGwsCredentialsFile,
} from "./agent/tools/google.js";
import { loadBoard } from "./agent/tools/projects.js";

const RESTART_MARKER = path.resolve("data/.restart-pending");

const startTime = Date.now();

function formatUptime(): string {
  const ms = Date.now() - startTime;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function handleStatus(userId: string): string {
  const mem = process.memoryUsage();
  const rss = (mem.rss / 1024 / 1024).toFixed(1);

  const lines = [
    `*Status*`,
    `Uptime: ${formatUptime()}`,
    `Memory: ${rss} MB RSS`,
    `Sessions: ${getActiveSessions()} active`,
  ];

  const session = getSessionInfo(userId);
  if (session) {
    const age = Date.now() - session.lastActivity;
    const mins = Math.floor(age / 60000);
    lines.push(`Your session: ${session.messageCount} msgs, last active ${mins}m ago`);
  } else {
    lines.push(`Your session: none`);
  }

  lines.push(`Cron jobs: ${getActiveCronCount()} active`);

  const configuredAgentEmail = getConfiguredAgentEmail();
  const verifiedAgentEmail = getCachedVerifiedAgentEmail();
  const credentialsFile = getConfiguredGwsCredentialsFile();
  lines.push(`Agent email: ${configuredAgentEmail ?? "not configured"}`);
  lines.push(`Gmail identity: ${verifiedAgentEmail ?? "not yet verified"}`);
  lines.push(`GWS credentials: ${credentialsFile ?? "default auth store"}`);

  try {
    const board = loadBoard();
    const active = board.projects.filter((p) => p.status === "active" || p.status === "paused");
    lines.push(`Projects: ${active.length} active`);
  } catch {
    lines.push(`Projects: unavailable`);
  }

  return lines.join("\n");
}

async function handleNew(userId: string): Promise<string> {
  const existed = await clearSession(userId);
  return existed
    ? "Session cleared. Next message starts fresh."
    : "No active session.";
}

function handleRestart(userId: string): string {
  fs.mkdirSync(path.dirname(RESTART_MARKER), { recursive: true });
  fs.writeFileSync(RESTART_MARKER, JSON.stringify({ userId, timestamp: Date.now() }));

  // Touch a source file to trigger tsx watch restart, with process.exit as fallback
  setTimeout(() => {
    try {
      const trigger = path.resolve("src/server.ts");
      const now = new Date();
      fs.utimesSync(trigger, now, now);
    } catch {
      process.exit(0);
    }
  }, 500);

  return "Restarting…";
}

/**
 * Check for a restart marker on startup. Returns the userId that
 * requested the restart, or null if there was no pending restart.
 */
export function checkRestartMarker(): string | null {
  if (!fs.existsSync(RESTART_MARKER)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_MARKER, "utf-8"));
    fs.unlinkSync(RESTART_MARKER);
    return data.userId ?? null;
  } catch {
    try { fs.unlinkSync(RESTART_MARKER); } catch {}
    return null;
  }
}

export async function handleCommand(text: string, userId: string): Promise<string | null> {
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case "/status":
      return handleStatus(userId);
    case "/new":
      return await handleNew(userId);
    case "/restart":
      return handleRestart(userId);
    default:
      return null;
  }
}

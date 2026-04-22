import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "fs";
import path from "path";
import express from "express";
import next from "next";
import { startTelegramBot } from "./telegram/bot.js";
import {
  restoreCronJobs,
  setCronTriggerHandler,
  getCronJobs,
  getActiveCronCount,
  getRunningJobIds,
} from "./agent/tools/cron.js";
import {
  runAgent,
  loadSessions,
  cleanupStaleSessions,
  getSessionInfo,
  getActiveSessions,
} from "./agent/index.js";
import { loadAllSkills } from "./agent/skills/loader.js";
import { buildRegistry, getRegistryStats } from "./agent/skills/registry.js";
import { CronExpressionParser } from "cron-parser";
import { getEventsSince, getLatestSeq } from "./agent/events.js";
import { verifyGoogleWorkspaceIdentity } from "./agent/tools/google.js";
import { handleCommand, checkRestartMarker } from "./commands.js";
import { initMemoryIndex } from "./agent/memory/index.js";
import { consolidateUnprocessedSessions } from "./agent/consolidation.js";
import { CONTEXT_DIR, MEMORY_DIR, HISTORY_DIR } from "./paths.js";
import cron from "node-cron";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000");

async function main() {
  // Clean env after dotenv loaded placeholders
  if (process.env.ANTHROPIC_API_KEY?.startsWith("your-")) {
    delete process.env.ANTHROPIC_API_KEY;
  }

  // 0. Copy memory templates if no .qmd files exist yet
  const memoryDir = path.resolve("memory");
  if (fs.existsSync(memoryDir)) {
    for (const file of fs.readdirSync(memoryDir)) {
      if (!file.endsWith(".example.qmd")) continue;
      const target = path.join(memoryDir, file.replace(".example.qmd", ".qmd"));
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(memoryDir, file), target);
        process.stderr.write(`[memory] Copied template ${file} -> ${path.basename(target)}\n`);
      }
    }
  }

  // 1. Initialize Next.js
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  // 2. Initialize memory index + session persistence
  await initMemoryIndex();
  loadSessions();
  cleanupStaleSessions();

  if (process.env.AGENT_EMAIL?.trim()) {
    try {
      await verifyGoogleWorkspaceIdentity();
      console.log(`Google Workspace identity verified for ${process.env.AGENT_EMAIL}`);
    } catch (err: any) {
      console.warn(`Google Workspace verification failed (non-fatal): ${err.message}`);
    }
  }

  setInterval(cleanupStaleSessions, 60 * 60 * 1000); // hourly cleanup

  // 2b. Nightly memory consolidation (catches low-volume days)
  cron.schedule("0 3 * * *", () => {
    consolidateUnprocessedSessions().catch((e) =>
      process.stderr.write(`[consolidation] Nightly run failed: ${e}\n`)
    );
  });

  // 3. Create Express server
  const server = express();
  server.use(express.json());

  // API: Chat endpoint for web UI
  server.post("/api/chat", async (req, res) => {
    const { message, userId = "web:anonymous", stream = false } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const cmdResponse = await handleCommand(message, userId);
    if (cmdResponse) {
      res.json({ response: cmdResponse });
      return;
    }

    if (!stream) {
      try {
        const response = await runAgent(userId, message);
        res.json({ response });
      } catch (err: any) {
        const errMsg = err?.message ?? String(err);
        const errStack = err?.stack ?? "";
        process.stderr.write(`Chat API error: ${errMsg}\n${errStack}\n`);
        res.status(500).json({ error: "Agent error", detail: errMsg });
      }
      return;
    }

    // SSE streaming path
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (event: string, data: object) => {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (err: any) {
        process.stderr.write(`[sse] write failed (${event}): ${err?.message ?? err}\n`);
      }
    };

    try {
      const response = await runAgent(userId, message, (evt) => {
        switch (evt.type) {
          case "status":
            sendEvent("status", { text: evt.text });
            break;
          case "tool":
            sendEvent("tool", { name: evt.name, input: evt.input });
            break;
          case "memory_hit":
            sendEvent("memory_hit", {
              path: evt.path,
              heading: evt.heading,
              score: evt.score,
            });
            break;
          case "usage":
            sendEvent("usage", {
              inputTokens: evt.inputTokens,
              outputTokens: evt.outputTokens,
              cacheReadTokens: evt.cacheReadTokens,
              cacheWriteTokens: evt.cacheWriteTokens,
              costUsd: evt.costUsd,
            });
            break;
        }
      });
      sendEvent("done", { response });
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      process.stderr.write(
        `\n==== /api/chat ERROR ====\n${errMsg}\nSTACK:\n${err?.stack ?? "(no stack)"}\n========================\n`,
      );
      sendEvent("error", { error: errMsg });
    } finally {
      res.end();
    }
  });

  // API: Unified chat history (web + telegram, excluding cron)
  server.get("/api/history", (_req, res) => {
    try {
      if (!fs.existsSync(HISTORY_DIR)) {
        res.json({ messages: [] });
        return;
      }
      const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".jsonl"));
      const entries: { timestamp: string; userId: string; userMessage: string; assistantResponse: string }[] = [];
      for (const file of files) {
        const lines = fs.readFileSync(path.join(HISTORY_DIR, file), "utf-8").trim().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.userId?.startsWith("cron:")) continue;
            // Filter out polluted SDK-error responses so they don't keep replaying on every page load.
            const resp: string = entry.assistantResponse ?? "";
            if (resp.startsWith("Error: error_during_execution") || resp.startsWith("Error: error_max_")) continue;
            entries.push(entry);
          } catch { /* skip malformed lines */ }
        }
      }
      entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      res.json({ messages: entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Agent identity for the web UI
  server.get("/api/identity", (_req, res) => {
    const contextFile = path.join(CONTEXT_DIR, "base-context.qmd");
    const baseFile = fs.existsSync(contextFile) ? contextFile : path.join(MEMORY_DIR, "base-context.qmd");
    let agentName = "Lightweight Agent";
    let agentRole = "";
    let expertise = "";
    let replyStyle = "";
    let timezone = "";
    try {
      if (fs.existsSync(baseFile)) {
        const content = fs.readFileSync(baseFile, "utf-8");
        const field = (name: string) => {
          const m = content.match(new RegExp(`^- ${name}:\\s*(.+)$`, "m"));
          const v = m?.[1]?.trim();
          return v && v !== "(not set)" ? v : "";
        };
        agentName = field("Name") || agentName;
        agentRole = field("Role");
        expertise = field("Expertise");
        replyStyle = field("Reply style");
        timezone = field("Timezone");
      }
    } catch { /* use defaults */ }
    res.json({ name: agentName, role: agentRole, expertise, replyStyle, timezone });
  });

  // API: Live ambient state for the day ribbon + state row
  server.get("/api/state", async (_req, res) => {
    try {
      const sessionInfo = getSessionInfo("web:anonymous");
      const now = Date.now();
      const session = sessionInfo
        ? {
            id: sessionInfo.sessionId,
            ageMs: now - sessionInfo.lastActivity,
            messageCount: sessionInfo.messageCount,
            capacity: 40,
          }
        : null;

      const jobs = getCronJobs();
      const runningIds = getRunningJobIds();
      const cronJobs = jobs.map((j) => {
        let nextRun: string | null = null;
        if (j.enabled) {
          try {
            nextRun = CronExpressionParser.parse(j.schedule).next().toISOString();
          } catch {
            /* invalid expression — skip */
          }
        }
        return {
          id: j.id,
          description: j.description,
          schedule: j.schedule,
          enabled: j.enabled,
          lastRun: j.lastRun ?? null,
          nextRun,
          running: runningIds.includes(j.id),
        };
      });
      cronJobs.sort((a, b) => {
        if (a.nextRun && b.nextRun) return a.nextRun.localeCompare(b.nextRun);
        if (a.nextRun) return -1;
        if (b.nextRun) return 1;
        return 0;
      });

      // Skills — full registry entries for the Skills panel.
      let skillsStats: { total: number; available: number; unavailable: number } = {
        total: 0,
        available: 0,
        unavailable: 0,
      };
      let skillsList: {
        name: string;
        description: string;
        location: string;
        userInvocable: boolean;
        requirementsMet: boolean;
        unmetRequirements?: string[];
      }[] = [];
      try {
        const fullSkills = await loadAllSkills();
        const registry = buildRegistry(fullSkills);
        const stats = getRegistryStats(registry);
        skillsStats = {
          total: stats.total,
          available: stats.available,
          unavailable: stats.unavailable,
        };
        skillsList = registry.map((s) => ({
          name: s.name,
          description: s.description,
          location: s.location,
          userInvocable: s.userInvocable,
          requirementsMet: s.requirementsMet,
          unmetRequirements: s.unmetRequirements,
        }));
      } catch {
        /* keep zeros */
      }

      // MCP servers — derived from the same env-gated checks used in runAgent
      const mcpServers: { name: string; status: "active" | "inactive"; reason?: string }[] = [
        { name: "agent-tools", status: "active" as const },
        {
          name: "exa",
          status: process.env.EXA_API_KEY ? ("active" as const) : ("inactive" as const),
          reason: process.env.EXA_API_KEY ? undefined : "EXA_API_KEY not set",
        },
        {
          name: "github",
          status: process.env.GITHUB_TOKEN ? ("active" as const) : ("inactive" as const),
          reason: process.env.GITHUB_TOKEN ? undefined : "GITHUB_TOKEN not set",
        },
        {
          name: "vercel",
          status: process.env.VERCEL_TOKEN ? ("active" as const) : ("inactive" as const),
          reason: process.env.VERCEL_TOKEN ? undefined : "VERCEL_TOKEN not set",
        },
      ];

      // Memory stats
      let memoryStats: { files: number; totalBytes: number; lastWrite: string | null } = {
        files: 0,
        totalBytes: 0,
        lastWrite: null,
      };
      if (fs.existsSync(MEMORY_DIR)) {
        const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".qmd"));
        let totalBytes = 0;
        let latest = 0;
        for (const f of files) {
          const stat = fs.statSync(path.join(MEMORY_DIR, f));
          totalBytes += stat.size;
          if (stat.mtimeMs > latest) latest = stat.mtimeMs;
        }
        memoryStats = {
          files: files.length,
          totalBytes,
          lastWrite: latest ? new Date(latest).toISOString() : null,
        };
      }

      // "Today" activity — chat turns by channel and cron runs
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayMs = startOfDay.getTime();

      let todayChat = 0;
      let todayTg = 0;
      const todayEvents: { kind: "chat" | "telegram" | "cron"; at: number; label: string }[] = [];

      if (fs.existsSync(HISTORY_DIR)) {
        const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          const lines = fs.readFileSync(path.join(HISTORY_DIR, file), "utf-8").trim().split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (!entry.timestamp) continue;
              const ts = Date.parse(entry.timestamp);
              if (Number.isNaN(ts) || ts < startOfDayMs) continue;
              if (entry.userId?.startsWith("cron:")) {
                todayEvents.push({
                  kind: "cron",
                  at: ts,
                  label: entry.userId.replace("cron:", ""),
                });
              } else if (entry.userId?.startsWith("telegram:")) {
                todayTg++;
                todayEvents.push({ kind: "telegram", at: ts, label: "telegram" });
              } else {
                todayChat++;
                todayEvents.push({ kind: "chat", at: ts, label: "chat" });
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      }
      todayEvents.sort((a, b) => a.at - b.at);

      res.json({
        session,
        cron: {
          active: getActiveCronCount(),
          runningIds,
          jobs: cronJobs,
        },
        skills: { ...skillsStats, list: skillsList },
        mcp: mcpServers,
        memory: memoryStats,
        today: {
          chatTurns: todayChat,
          tgTurns: todayTg,
          events: todayEvents,
          startMs: startOfDayMs,
        },
        activeSessions: getActiveSessions(),
        now,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Rolling event log (tool calls, memory hits, cron fires, etc.)
  server.get("/api/events", (req, res) => {
    const sinceRaw = req.query.since as string | undefined;
    const since = sinceRaw ? Number(sinceRaw) : undefined;
    const events = getEventsSince(
      Number.isFinite(since as number) ? (since as number) : undefined,
      200,
    );
    res.json({ events, latestSeq: getLatestSeq() });
  });

  // API: Read a memory file snippet for footnote hover
  server.get("/api/memory/:name", (req, res) => {
    const name = req.params.name;
    // Tight whitelist: only allow exact .qmd filename, no path chars
    if (!/^[A-Za-z0-9._-]+\.qmd$/.test(name)) {
      res.status(400).json({ error: "invalid filename" });
      return;
    }
    const filePath = path.join(MEMORY_DIR, name);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "not found" });
      return;
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      res.json({ name, excerpt: content.slice(0, 600), totalBytes: content.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // All other routes -> Next.js
  server.all("/{*path}", (req, res) => handle(req, res));

  // 4. Start Telegram bot
  const bot = startTelegramBot();

  // 5. Set up cron trigger handler
  setCronTriggerHandler(async (job) => {
    console.log(`Cron triggered: [${job.id}] ${job.description}`);
    try {
      await runAgent(`cron:${job.id}`, job.action);
    } catch (err) {
      console.error(`Cron job ${job.id} failed:`, err);
    }
  });

  // 6. Restore saved cron jobs
  restoreCronJobs();

  // 7. Start server
  server.listen(port, () => {
    console.log(`Lightweight Agent running on http://localhost:${port}`);
    console.log(`  Web UI:   http://localhost:${port}`);
    console.log(`  Chat API: POST http://localhost:${port}/api/chat`);
    if (bot) console.log(`  Telegram: Active (polling)`);

    // Notify requester if this startup follows a /restart command
    const restartUser = checkRestartMarker();
    if (restartUser && bot && restartUser.startsWith("telegram:")) {
      const chatId = parseInt(restartUser.replace("telegram:", ""));
      if (chatId) {
        // Small delay to ensure Telegram polling is connected
        setTimeout(() => {
          bot.sendMessage(chatId, "Restart complete.").catch(console.error);
        }, 2000);
      }
    }
  });
}

main().catch(console.error);

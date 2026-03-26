import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "fs";
import path from "path";
import express from "express";
import next from "next";
import { startTelegramBot, sendTelegramMessage } from "./telegram/bot.js";
import { restoreCronJobs, setCronTriggerHandler } from "./agent/tools/cron.js";
import { runAgent, loadSessions, cleanupStaleSessions } from "./agent/index.js";
import { verifyGoogleWorkspaceIdentity } from "./agent/tools/google.js";
import { handleCommand, checkRestartMarker } from "./commands.js";
import { initMemoryIndex } from "./agent/memory/index.js";
import { consolidateUnprocessedSessions } from "./agent/consolidation.js";
import { MEMORY_DIR } from "./paths.js";
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
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const response = await runAgent(userId, message, (status) => {
        sendEvent("status", { text: status });
      });
      sendEvent("done", { response });
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      process.stderr.write(`Chat API error: ${errMsg}\n${err?.stack ?? ""}\n`);
      sendEvent("error", { error: errMsg });
    } finally {
      res.end();
    }
  });

  // API: Agent identity for the web UI
  server.get("/api/identity", (_req, res) => {
    const baseFile = path.join(MEMORY_DIR, "base-context.qmd");
    let agentName = "Lightweight Agent";
    let agentRole = "";
    let expertise = "";
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
      }
    } catch { /* use defaults */ }
    res.json({ name: agentName, role: agentRole, expertise });
  });

  // All other routes -> Next.js
  server.all("/{*path}", (req, res) => handle(req, res));

  // 4. Start Telegram bot
  const bot = startTelegramBot();

  // 5. Set up cron trigger handler
  setCronTriggerHandler(async (job) => {
    console.log(`Cron triggered: [${job.id}] ${job.description}`);
    try {
      const response = await runAgent(`cron:${job.id}`, job.action);
      // Send cron results to Telegram
      if (bot) {
        sendTelegramMessage(bot, `**Scheduled: ${job.description}**\n\n${response}`);
      }
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

import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import os from "os";
import { runAgent } from "../agent/index.js";
import { handleCommand } from "../commands.js";
import { transcribeAudio } from "../lib/whisper.js";
import { projectName } from "../lib/project-name.js";

const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * Download a Telegram file by fileId and return the local path.
 */
async function downloadTelegramFile(bot: TelegramBot, fileId: string): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `${projectName()}-telegram`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = await bot.downloadFile(fileId, tmpDir);
  return filePath;
}

/**
 * Send a text response, handling Telegram's 4096-char limit and markdown fallback.
 */
async function sendTextResponse(bot: TelegramBot, chatId: number, text: string) {
  if (text.length <= 4096) {
    await bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch(() =>
      bot.sendMessage(chatId, text)
    );
  } else {
    const chunks = text.match(/[\s\S]{1,4096}/g) ?? [];
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }
  }
}

/**
 * Send a response back, detecting [[VOICE:path]] markers for voice delivery.
 */
async function sendResponse(bot: TelegramBot, chatId: number, response: string) {
  const voiceMatch = response.match(/\[\[VOICE:(.*?)\]\]/);
  if (voiceMatch) {
    const voicePath = voiceMatch[1];
    const textPart = response.replace(/\[\[VOICE:.*?\]\]/, "").trim();
    try {
      await bot.sendVoice(chatId, voicePath);
    } catch (err) {
      console.error("Failed to send voice:", err);
    }
    // Clean up temp file
    if (fs.existsSync(voicePath)) {
      fs.unlinkSync(voicePath);
    }
    if (textPart) {
      await sendTextResponse(bot, chatId, textPart);
    }
    return;
  }
  await sendTextResponse(bot, chatId, response);
}

/**
 * Process a single message: typing indicator + agent run + send response.
 */
async function processMessage(bot: TelegramBot, chatId: number, userKey: string, text: string) {
  await bot.sendChatAction(chatId, "typing");
  const typingInterval = setInterval(() => {
    bot.sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);

  try {
    const response = await runAgent(userKey, text);
    await sendResponse(bot, chatId, response);
  } catch (err) {
    console.error("Agent error:", err);
    await bot.sendMessage(chatId, "Something went wrong. Please try again.");
  } finally {
    clearInterval(typingInterval);
  }
}

const activeRequests = new Map<string, Promise<void>>();

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.startsWith("your-")) {
    console.warn("TELEGRAM_BOT_TOKEN not configured, skipping Telegram bot");
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Stop polling cleanly on process exit to prevent duplicate updates
  const stopPolling = () => {
    bot.stopPolling().catch(() => {});
  };
  process.once("SIGINT", stopPolling);
  process.once("SIGTERM", stopPolling);
  process.once("exit", stopPolling);

  bot.on("polling_error", (err) => {
    // Log once, not every poll cycle
    if (!(bot as any)._pollingErrorLogged) {
      console.error("Telegram polling error:", (err as any)?.message ?? err);
      (bot as any)._pollingErrorLogged = true;
    }
  });

  // Handle fatal errors to prevent unhandled rejections crashing the process
  bot.on("error", (err) => {
    console.error("Telegram bot error:", (err as any)?.message ?? err);
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString() ?? "";

    // Auth check — matches against numeric user ID or username
    const username = msg.from?.username ?? "";
    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId) && !ALLOWED_USERS.includes(username)) {
      console.log(`Unauthorized Telegram user: id=${userId} username=${username}`);
      await bot.sendMessage(chatId, "Unauthorized.");
      return;
    }

    // React with 👀 to acknowledge receipt (fire-and-forget)
    bot.setMessageReaction(chatId, msg.message_id, {
      reaction: [{ type: "emoji", emoji: "👀" }],
    }).catch(() => {});

    let text = msg.text ?? "";

    // Slash commands — instant response, no queue
    if (text.startsWith("/")) {
      const userKey = `telegram:${userId}`;
      const response = await handleCommand(text, userKey);
      if (response) {
        await sendTextResponse(bot, chatId, response);
        return;
      }
    }

    // Handle voice messages and audio files
    const voiceOrAudio = msg.voice ?? msg.audio;
    if (voiceOrAudio) {
      await bot.sendChatAction(chatId, "typing");
      let downloadedPath: string | null = null;
      try {
        downloadedPath = await downloadTelegramFile(bot, voiceOrAudio.file_id);
        const result = await transcribeAudio(downloadedPath);
        text = result.text;
        // Prepend caption as context if present
        if (msg.caption) {
          text = `[Context: ${msg.caption}]\n\n${text}`;
        }
        if (!text) {
          await bot.sendMessage(chatId, "Could not detect any speech in that audio.");
          return;
        }
      } catch (err: any) {
        console.error("Transcription error:", err);
        await bot.sendMessage(chatId, "Failed to transcribe audio. Please try again or send text.");
        return;
      } finally {
        if (downloadedPath && fs.existsSync(downloadedPath)) {
          fs.unlinkSync(downloadedPath);
        }
      }
    }

    if (!text) return;

    const userKey = `telegram:${userId}`;

    // Per-user message queue: if a request is already in-flight, acknowledge and chain
    const pending = activeRequests.get(userKey);
    if (pending) {
      await bot.sendMessage(chatId, "Got it — finishing up your previous request first.");
    }

    const task = (pending ?? Promise.resolve()).then(() =>
      processMessage(bot, chatId, userKey, text)
    );

    activeRequests.set(userKey, task);

    task.finally(() => {
      // Only clean up if this is still the latest task in the chain
      if (activeRequests.get(userKey) === task) {
        activeRequests.delete(userKey);
      }
    });
  });

  console.log("Telegram bot started (polling)");
  return bot;
}

// Helper to send a message from cron jobs
export function sendTelegramMessage(bot: TelegramBot, message: string) {
  const users = ALLOWED_USERS;
  for (const userId of users) {
    bot.sendMessage(parseInt(userId), message).catch(console.error);
  }
}

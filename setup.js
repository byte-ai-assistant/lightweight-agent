#!/usr/bin/env node

// Lightweight Agent — interactive setup script
// Run: node setup.js

import { createInterface } from "readline";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, join } from "path";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function askSecret(question) {
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${hint}`, "");
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

function heading(text) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"=".repeat(60)}\n`);
}

function info(text) {
  console.log(`  ${text}`);
}

function success(text) {
  console.log(`  [ok] ${text}`);
}

function warn(text) {
  console.log(`  [!] ${text}`);
}

function which(bin) {
  try {
    return execSync(`which ${bin}`, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function checkEnvKey(key) {
  try {
    const val = execSync(`printenv ${key}`, { encoding: "utf-8" }).trim();
    return val || null;
  } catch {
    return null;
  }
}

// ---

const ROOT = resolve(".");
const ENV_PATH = join(ROOT, ".env.local");
const MEMORY_DIR = join(ROOT, "memory");

const env = {};
const enabled = { telegram: false, google: false, voice: false };

async function main() {
  heading("Lightweight Agent Setup");
  info("This will walk you through configuring your agent.");
  info("Press Enter to accept defaults. Leave blank to skip optional values.\n");

  // Check if .env.local already exists
  if (existsSync(ENV_PATH)) {
    const overwrite = await confirm(".env.local already exists. Overwrite it?", false);
    if (!overwrite) {
      info("Keeping existing .env.local. Skipping to agent context setup.\n");
      await setupAgentContext();
      finish();
      return;
    }
  }

  // ── Core ──────────────────────────────────────────────────────────

  heading("1. Core Settings");

  env.PORT = await ask("Port", "3000");

  // Anthropic
  const existingAnthropicKey = checkEnvKey("ANTHROPIC_API_KEY");
  if (existingAnthropicKey) {
    success("ANTHROPIC_API_KEY found in your environment.");
    const useExisting = await confirm("Use it?");
    if (useExisting) {
      env.ANTHROPIC_API_KEY = existingAnthropicKey;
    }
  }

  if (!env.ANTHROPIC_API_KEY) {
    info("The Claude Agent SDK needs authentication.");
    info("If you already use Claude Code on this machine, you can skip this —");
    info("the SDK will reuse your existing local auth.\n");
    const key = await askSecret("ANTHROPIC_API_KEY (blank to skip)");
    if (key) env.ANTHROPIC_API_KEY = key;
  }

  // OpenAI
  info("\nOpenAI is used for memory embeddings and Whisper transcription.");
  const existingOpenAIKey = checkEnvKey("OPENAI_API_KEY");
  if (existingOpenAIKey) {
    success("OPENAI_API_KEY found in your environment.");
    const useExisting = await confirm("Use it?");
    if (useExisting) {
      env.OPENAI_API_KEY = existingOpenAIKey;
    }
  }

  if (!env.OPENAI_API_KEY) {
    const key = await askSecret("OPENAI_API_KEY (blank to skip)");
    if (key) env.OPENAI_API_KEY = key;
  }

  if (env.OPENAI_API_KEY) {
    env.WHISPER_MODEL = await ask("Whisper model", "whisper-1");
  }

  // ── Telegram ──────────────────────────────────────────────────────

  heading("2. Telegram Bot (optional)");

  const wantTelegram = await confirm("Set up a Telegram bot?");
  if (wantTelegram) {
    info("\nTo create a bot:");
    info("  1. Open Telegram and search for @BotFather");
    info("  2. Send /newbot and follow the prompts");
    info("  3. Copy the bot token BotFather gives you\n");
    env.TELEGRAM_BOT_TOKEN = await askSecret("TELEGRAM_BOT_TOKEN");

    if (env.TELEGRAM_BOT_TOKEN) {
      info("\nYou need your numeric Telegram user ID (not your username).");
      info("To find it: search for @userinfobot in Telegram and start a chat.\n");
      env.TELEGRAM_ALLOWED_USERS = await ask("TELEGRAM_ALLOWED_USERS (comma-separated IDs)");
      enabled.telegram = true;
    }
  }

  // ── Google Workspace ──────────────────────────────────────────────

  heading("3. Google Workspace (optional)");

  const wantGoogle = await confirm("Set up Google Workspace tools (Gmail, Calendar, Drive, etc.)?");
  if (wantGoogle) {
    // Detect gws binary
    const detectedGws = which("gws");
    if (detectedGws) {
      success(`Found gws at ${detectedGws}`);
      env.GWS_BINARY = await ask("GWS_BINARY", detectedGws);
    } else {
      warn("gws not found on PATH.");
      info("Install it: brew install googleworkspace-cli");
      info("Then run: gws auth login\n");
      const gwsPath = await ask("GWS_BINARY (path to gws binary, blank to skip)");
      if (gwsPath) env.GWS_BINARY = gwsPath;
    }

    if (env.GWS_BINARY || detectedGws) {
      info("\nSet AGENT_EMAIL to pin the agent to a specific Google account.");
      info("Leave blank to use whatever account gws is currently authenticated as.\n");
      env.AGENT_EMAIL = await ask("AGENT_EMAIL (e.g. agent@example.com)");

      const wantCreds = await confirm("Use a dedicated credentials file for gws?", false);
      if (wantCreds) {
        env.GWS_CREDENTIALS_FILE = await ask("GWS_CREDENTIALS_FILE (absolute path)");
      }
      enabled.google = true;
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────

  heading("4. Voice Replies (optional)");

  const wantVoice = await confirm("Set up ElevenLabs voice replies?", false);
  if (wantVoice) {
    // Detect ffmpeg
    const detectedFfmpeg = which("ffmpeg");
    if (detectedFfmpeg) {
      success(`Found ffmpeg at ${detectedFfmpeg}`);
    } else {
      warn("ffmpeg not found. Voice replies and audio transcription need it.");
      info("Install it: brew install ffmpeg\n");
    }

    env.ELEVEN_LABS_API_KEY = await askSecret("ELEVEN_LABS_API_KEY");
    if (env.ELEVEN_LABS_API_KEY) {
      env.ELEVEN_LABS_VOICE_ID = await ask("ELEVEN_LABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb");
      enabled.voice = true;
    }
  }

  // ── Write .env.local ──────────────────────────────────────────────

  writeEnvFile();

  // ── Agent context ─────────────────────────────────────────────────

  await setupAgentContext();

  // ── Dependencies ──────────────────────────────────────────────────

  heading("6. Dependencies");

  if (!existsSync(join(ROOT, "node_modules"))) {
    info("node_modules not found. Running npm install...\n");
    try {
      execSync("npm install", { stdio: "inherit", cwd: ROOT });
      success("Dependencies installed.");
    } catch {
      warn("npm install failed. Run it manually before starting the app.");
    }
  } else {
    success("node_modules already exists.");
  }

  finish();
}

function writeEnvFile() {
  heading("5. Writing .env.local");

  const lines = [];
  const add = (key, value, comment) => {
    if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=${value ?? ""}`);
    lines.push("");
  };

  add("PORT", env.PORT || "3000");

  if (env.ANTHROPIC_API_KEY) {
    add("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY);
  }

  if (env.OPENAI_API_KEY) {
    add("OPENAI_API_KEY", env.OPENAI_API_KEY);
    add("WHISPER_MODEL", env.WHISPER_MODEL || "whisper-1");
  }

  if (env.TELEGRAM_BOT_TOKEN) {
    add("TELEGRAM_BOT_TOKEN", env.TELEGRAM_BOT_TOKEN, "Telegram");
    add("TELEGRAM_ALLOWED_USERS", env.TELEGRAM_ALLOWED_USERS || "");
  }

  if (env.GWS_BINARY || env.AGENT_EMAIL || env.GWS_CREDENTIALS_FILE) {
    lines.push("# Google Workspace");
    if (env.AGENT_EMAIL) add("AGENT_EMAIL", env.AGENT_EMAIL);
    if (env.GWS_BINARY) add("GWS_BINARY", env.GWS_BINARY);
    if (env.GWS_CREDENTIALS_FILE) add("GWS_CREDENTIALS_FILE", env.GWS_CREDENTIALS_FILE);
  }

  if (env.ELEVEN_LABS_API_KEY) {
    add("ELEVEN_LABS_API_KEY", env.ELEVEN_LABS_API_KEY, "Voice");
    add("ELEVEN_LABS_VOICE_ID", env.ELEVEN_LABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb");
  }

  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  success(`Wrote ${ENV_PATH}`);
}

async function setupAgentContext() {
  heading("Agent Context");

  info("Your agent has memory files that shape how it behaves.");
  info("Let's personalize the core context so the agent knows who you are.\n");

  const wantContext = await confirm("Set up agent context now?");
  if (!wantContext) {
    info("Skipping. You can edit memory/*.qmd files later.");
    return;
  }

  mkdirSync(MEMORY_DIR, { recursive: true });

  // ── base-context.qmd ─────────────────────────────────────────────

  console.log("");
  info("-- About You --\n");
  const name = await ask("Your name");
  const role = await ask("Your role (e.g. engineer, founder, student)");
  const timezone = await ask("Your timezone (e.g. America/New_York, UTC+2)");
  const commStyle = await ask("Communication style preference", "concise, direct");

  const baseContext = `---
title: "Agent Base Context"
description: "Always-loaded background context for your agent"
---

# About the User

- Name: ${name || "(not set)"}
- Role: ${role || "(not set)"}
- Timezone: ${timezone || "(not set)"}

# Preferences

- Communication style: ${commStyle}
- Preferred level of detail: practical

# Important Contacts

- Add the people your agent should know about here

# Recurring Tasks

- Add recurring workflows, reminders, or routines here

# Notes

- This file is loaded on every interaction
- Keep it short and durable
`;

  writeFileSync(join(MEMORY_DIR, "base-context.qmd"), baseContext);
  success("Wrote memory/base-context.qmd");

  // ── goals.qmd ─────────────────────────────────────────────────────

  console.log("");
  info("-- Goals (optional) --\n");
  info("What are you currently focused on? Enter goals one per line.");
  info("Press Enter on an empty line when done.\n");

  const goals = [];
  while (true) {
    const goal = await ask("  Goal (blank to finish)");
    if (!goal) break;
    goals.push(goal);
  }

  if (goals.length > 0) {
    const goalsContent = `---
title: "Goals"
description: "Long-term goals and priorities"
---

# Current Goals

${goals.map((g) => `- ${g}`).join("\n")}

# Longer-Term Priorities

- Add your medium- and long-term priorities here
`;
    writeFileSync(join(MEMORY_DIR, "goals.qmd"), goalsContent);
    success("Wrote memory/goals.qmd");
  }

  // ── people.qmd ────────────────────────────────────────────────────

  console.log("");
  info("-- Key People (optional) --\n");
  info("Add people your agent should know about.");
  info("Format: name, then a short note about them.");
  info("Press Enter on an empty line when done.\n");

  const people = [];
  while (true) {
    const personName = await ask("  Name (blank to finish)");
    if (!personName) break;
    const personNote = await ask(`  Who is ${personName}?`);
    people.push({ name: personName, note: personNote });
  }

  if (people.length > 0) {
    const peopleContent = `---
title: "People"
description: "Important people and relationships"
---

# Key People

${people.map((p) => `- ${p.name}: ${p.note || "(no note)"}`).join("\n")}
`;
    writeFileSync(join(MEMORY_DIR, "people.qmd"), peopleContent);
    success("Wrote memory/people.qmd");
  }

  // ── projects.qmd ──────────────────────────────────────────────────

  console.log("");
  info("-- Projects (optional) --\n");
  info("What are you currently working on?");
  info("Press Enter on an empty line when done.\n");

  const projects = [];
  while (true) {
    const projName = await ask("  Project name (blank to finish)");
    if (!projName) break;
    const projGoal = await ask(`  What's the goal of ${projName}?`);
    const projStatus = await ask("  Status (e.g. active, planning, paused)", "active");
    projects.push({ name: projName, goal: projGoal, status: projStatus });
  }

  if (projects.length > 0) {
    const projectsContent = `---
title: "Projects"
description: "Project context and status"
---

# Active Projects

${projects
  .map(
    (p) => `- ${p.name}
  - Goal: ${p.goal || "(not set)"}
  - Status: ${p.status}`
  )
  .join("\n")}
`;
    writeFileSync(join(MEMORY_DIR, "projects.qmd"), projectsContent);
    success("Wrote memory/projects.qmd");
  }
}

function finish() {
  heading("Setup Complete");

  info("Enabled features:");
  success("Web UI (localhost:" + (env.PORT || "3000") + ")");
  if (env.ANTHROPIC_API_KEY) success("Anthropic API key configured");
  else info("  No Anthropic key — will use local Claude auth");
  if (env.OPENAI_API_KEY) success("Memory embeddings + Whisper");
  if (enabled.telegram) success("Telegram bot");
  if (enabled.google) success("Google Workspace tools");
  if (enabled.voice) success("ElevenLabs voice replies");

  console.log("");
  info("Next steps:");
  info("  1. Review and edit memory/*.qmd to add more context");
  info("  2. Run: npm run dev");
  info("  3. Open: http://localhost:" + (env.PORT || "3000"));
  if (enabled.telegram) info("  4. Open your bot in Telegram and send a message");
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  rl.close();
  process.exit(1);
});

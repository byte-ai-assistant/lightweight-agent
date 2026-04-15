#!/usr/bin/env node

// Lightweight Agent — interactive setup script
// Run: node setup.js

import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "fs";
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

function askSecret(question, existing) {
  const hint = existing ? ` [${mask(existing)}]` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      resolve(answer.trim() || existing || "");
    });
  });
}

async function askMultiline(question, existing) {
  if (existing) {
    const preview = existing.length > 80 ? existing.slice(0, 80) + "…" : existing;
    info(`Current: ${preview}`);
    const keep = await confirm("Keep existing value?");
    if (keep) return existing;
  }
  info(`${question}`);
  info("Type your text. Enter a blank line to finish.\n");
  const lines = [];
  while (true) {
    const line = await new Promise((resolve) => {
      rl.question("  ", (answer) => resolve(answer));
    });
    if (line.trim() === "" && lines.length > 0) break;
    if (line.trim() === "" && lines.length === 0) return existing || "";
    lines.push(line);
  }
  return lines.join("\n");
}

function mask(secret) {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return secret.slice(0, 4) + "…" + secret.slice(-4);
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

// ── Load existing config ──────────────────────────────────────────────

function loadExistingEnv() {
  const existing = {};
  if (!existsSync(ENV_PATH)) return existing;
  try {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (value) existing[key] = value;
    }
  } catch { /* ignore */ }
  return existing;
}

function parseQmdField(content, field) {
  const regex = new RegExp(`^- ${field}:\\s*(.+)$`, "m");
  const match = content.match(regex);
  if (!match) return "";
  const val = match[1].trim();
  return val === "(not set)" ? "" : val;
}

function parseQmdList(content, heading) {
  const regex = new RegExp(`# ${heading}\\s*\\n([\\s\\S]*?)(?=\\n#|$)`);
  const section = content.match(regex);
  if (!section) return [];
  return section[1]
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter((l) => l && !l.startsWith("Add ") && l !== "(not set)");
}

function loadExistingContext() {
  const ctx = {
    agentName: "", agentRole: "", replyStyle: "",
    expertise: "", customSystemPrompt: "",
    rules: [],
    name: "", role: "", timezone: "",
    goals: [], people: [], projects: [],
  };

  const contextBaseFile = join(CONTEXT_DIR, "base-context.qmd");
  const legacyBaseFile = join(MEMORY_DIR, "base-context.qmd");
  const baseFile = existsSync(contextBaseFile) ? contextBaseFile : legacyBaseFile;
  if (existsSync(baseFile)) {
    const content = readFileSync(baseFile, "utf-8");
    ctx.agentName = parseQmdField(content, "Name");
    ctx.agentRole = parseQmdField(content, "Role");
    ctx.replyStyle = parseQmdField(content, "Reply style");
    ctx.expertise = parseQmdField(content, "Expertise");
    ctx.customSystemPrompt = parseQmdField(content, "Custom system prompt");
    ctx.rules = parseQmdList(content, "Always Consider");
    // User fields — in "About the User" section, re-parse with section scope
    const userSection = content.match(/# About the User\s*\n([\s\S]*?)(?=\n#|$)/);
    if (userSection) {
      ctx.name = parseQmdField(userSection[1], "Name");
      ctx.role = parseQmdField(userSection[1], "Role");
      ctx.timezone = parseQmdField(userSection[1], "Timezone");
    }
  }

  const goalsFile = join(MEMORY_DIR, "goals.qmd");
  if (existsSync(goalsFile)) {
    ctx.goals = parseQmdList(readFileSync(goalsFile, "utf-8"), "Current Goals");
  }

  const peopleFile = join(MEMORY_DIR, "people.qmd");
  if (existsSync(peopleFile)) {
    const content = readFileSync(peopleFile, "utf-8");
    const entries = parseQmdList(content, "Key People");
    ctx.people = entries.map((entry) => {
      const colonIdx = entry.indexOf(":");
      if (colonIdx === -1) return { name: entry, note: "" };
      return { name: entry.slice(0, colonIdx).trim(), note: entry.slice(colonIdx + 1).trim() };
    });
  }

  const projectsFile = join(MEMORY_DIR, "projects.qmd");
  if (existsSync(projectsFile)) {
    const content = readFileSync(projectsFile, "utf-8");
    const section = content.match(/# Active Projects\s*\n([\s\S]*?)(?=\n#|$)/);
    if (section) {
      const lines = section[1].split("\n");
      let current = null;
      for (const line of lines) {
        const nameMatch = line.match(/^- (.+)/);
        if (nameMatch && !line.match(/^\s+-/)) {
          if (current) ctx.projects.push(current);
          current = { name: nameMatch[1].trim(), goal: "", status: "active" };
        } else if (current) {
          const goalMatch = line.match(/Goal:\s*(.+)/);
          const statusMatch = line.match(/Status:\s*(.+)/);
          if (goalMatch) current.goal = goalMatch[1].trim();
          if (statusMatch) current.status = statusMatch[1].trim();
        }
      }
      if (current) ctx.projects.push(current);
      ctx.projects = ctx.projects.filter((p) => p.name !== "(replace me)");
    }
  }

  return ctx;
}

// ---

const ROOT = resolve(".");
const ENV_PATH = join(ROOT, ".env.local");
const PROFILE_DIR = join(ROOT, "profile");
const CONTEXT_DIR = join(PROFILE_DIR, "context");
const MEMORY_DIR = join(PROFILE_DIR, "memory");
const DATA_DIR = join(PROFILE_DIR, "data");
const CORE_MEMORY_DIR = join(ROOT, "memory"); // template source

const env = {};
const enabled = { telegram: false, google: false, voice: false, exa: false, github: false };

async function main() {
  const existing = loadExistingEnv();
  const isRerun = Object.keys(existing).length > 0;

  heading("Lightweight Agent Setup");

  if (isRerun) {
    info("Existing configuration detected. Press Enter to keep current values.");
    info("Type a new value to change, or leave blank to keep.\n");
  } else {
    info("This will walk you through configuring your agent.");
    info("Press Enter to accept defaults. Leave blank to skip optional values.\n");
  }

  // ── Core ──────────────────────────────────────────────────────────

  heading("1. Core Settings");

  env.PORT = await ask("Port", existing.PORT || "3000");

  // Anthropic
  const anthropicDefault = existing.ANTHROPIC_API_KEY || checkEnvKey("ANTHROPIC_API_KEY") || "";
  if (anthropicDefault) {
    env.ANTHROPIC_API_KEY = await askSecret("Anthropic API key (blank to skip)", anthropicDefault);
  } else {
    info("The Claude Agent SDK needs authentication.");
    info("If you already use Claude Code on this machine, you can skip this —");
    info("the SDK will reuse your existing local auth.\n");
    env.ANTHROPIC_API_KEY = await askSecret("Anthropic API key (blank to skip)", "");
  }

  // OpenAI
  info("\nOpenAI is used for memory embeddings and Whisper transcription.");
  const openaiDefault = existing.OPENAI_API_KEY || checkEnvKey("OPENAI_API_KEY") || "";
  env.OPENAI_API_KEY = await askSecret("OpenAI API key (blank to skip)", openaiDefault);

  if (env.OPENAI_API_KEY) {
    env.WHISPER_MODEL = existing.WHISPER_MODEL || "whisper-1";
  }

  // ── Telegram ──────────────────────────────────────────────────────

  heading("2. Telegram Bot (optional)");

  const hadTelegram = !!existing.TELEGRAM_BOT_TOKEN;
  const wantTelegram = hadTelegram
    ? !(await confirm("Telegram is already configured. Skip?"))
    : await confirm("Set up a Telegram bot?");

  if (wantTelegram) {
    if (!hadTelegram) {
      info("\nTo create a bot:");
      info("  1. Open Telegram and search for @BotFather");
      info("  2. Send /newbot and follow the prompts");
      info("  3. Copy the bot token BotFather gives you\n");
    }
    env.TELEGRAM_BOT_TOKEN = await askSecret("Bot token", existing.TELEGRAM_BOT_TOKEN || "");

    if (env.TELEGRAM_BOT_TOKEN) {
      if (!hadTelegram) {
        info("\nYou need your numeric Telegram user ID (not your username).");
        info("To find it: search for @userinfobot in Telegram and start a chat.\n");
      }
      env.TELEGRAM_ALLOWED_USERS = await ask(
        "Allowed user IDs (comma-separated)",
        existing.TELEGRAM_ALLOWED_USERS || ""
      );
      enabled.telegram = true;
    }
  }

  // ── Google Workspace ──────────────────────────────────────────────

  heading("3. Google Workspace (optional)");

  const hadGoogle = !!(existing.GWS_BINARY || existing.AGENT_EMAIL);
  const wantGoogle = hadGoogle
    ? !(await confirm("Google Workspace is already configured. Skip?"))
    : await confirm("Set up Google Workspace tools (Gmail, Calendar, Drive, etc.)?");

  if (wantGoogle) {
    const detectedGws = which("gws");
    const gwsDefault = existing.GWS_BINARY || detectedGws || "";

    if (gwsDefault) {
      success(`gws: ${gwsDefault}`);
      env.GWS_BINARY = gwsDefault;
    } else {
      warn("gws not found on PATH.");
      info("Install it:");
      info("  brew install googleworkspace-cli");
      info("Then set up OAuth credentials and log in:");
      info("  gcloud auth login");
      info("  gws auth setup");
      info("  gws auth login\n");
      const gwsPath = await ask("Path to gws binary (blank to skip Google Workspace)");
      if (gwsPath) env.GWS_BINARY = gwsPath;
    }

    if (env.GWS_BINARY) {
      if (!hadGoogle) {
        info("\nSet AGENT_EMAIL to pin the agent to a specific Google account.");
        info("Leave blank to use whatever account gws is currently authenticated as.\n");
      }
      env.AGENT_EMAIL = await ask("Agent email", existing.AGENT_EMAIL || "");
      enabled.google = true;
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────

  heading("4. Voice Replies (optional)");

  const hadVoice = !!existing.ELEVEN_LABS_API_KEY;
  const wantVoice = hadVoice
    ? !(await confirm("Voice replies are already configured. Skip?"))
    : await confirm("Set up ElevenLabs voice replies?", false);

  if (wantVoice) {
    const detectedFfmpeg = which("ffmpeg");
    if (detectedFfmpeg) {
      success(`ffmpeg: ${detectedFfmpeg}`);
    } else {
      warn("ffmpeg not found. Voice replies and audio transcription need it.");
      info("Install it: brew install ffmpeg\n");
    }

    env.ELEVEN_LABS_API_KEY = await askSecret("ElevenLabs API key", existing.ELEVEN_LABS_API_KEY || "");
    if (env.ELEVEN_LABS_API_KEY) {
      env.ELEVEN_LABS_VOICE_ID = await ask("Voice ID", existing.ELEVEN_LABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb");
      enabled.voice = true;
    }
  }

  // ── Exa Web Search ──────────────────────────────────────────────

  heading("5. Exa Web Search (optional)");

  const hadExa = !!existing.EXA_API_KEY;
  const wantExa = hadExa
    ? !(await confirm("Exa web search is already configured. Skip?"))
    : await confirm("Set up Exa web search?", false);

  if (wantExa) {
    if (!hadExa) {
      info("\nExa gives your agent real-time web search, code context, and company research.");
      info("Get an API key at https://dashboard.exa.ai/api-keys\n");
    }
    env.EXA_API_KEY = await askSecret("Exa API key", existing.EXA_API_KEY || "");
    if (env.EXA_API_KEY) {
      enabled.exa = true;
    }
  }

  // ── GitHub Access ──────────────────────────────────────────────

  heading("6. GitHub Access (optional)");

  const hadGitHub = !!existing.GITHUB_TOKEN;
  const wantGitHub = hadGitHub
    ? !(await confirm("GitHub access is already configured. Skip?"))
    : await confirm("Set up GitHub access?", false);

  if (wantGitHub) {
    if (!hadGitHub) {
      info("\nGitHub access lets your agent read and write issues, PRs, and code.");
      info("Create a personal access token at https://github.com/settings/tokens");
      info("Recommended scopes: repo, read:org\n");
    }
    env.GITHUB_TOKEN = await askSecret("GitHub token", existing.GITHUB_TOKEN || "");
    if (env.GITHUB_TOKEN) {
      enabled.github = true;
    }
  }

  // ── Write .env.local ──────────────────────────────────────────────

  writeEnvFile();

  // ── Profile ───────────────────────────────────────────────────────

  await setupProfile();

  // ── Agent context ─────────────────────────────────────────────────

  await setupAgentContext();

  // ── Dependencies ──────────────────────────────────────────────────

  heading("8. Dependencies");

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
  heading("6. Writing .env.local");

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

  if (env.GWS_BINARY || env.AGENT_EMAIL) {
    lines.push("# Google Workspace");
    if (env.AGENT_EMAIL) add("AGENT_EMAIL", env.AGENT_EMAIL);
    if (env.GWS_BINARY) add("GWS_BINARY", env.GWS_BINARY);
  }

  if (env.ELEVEN_LABS_API_KEY) {
    add("ELEVEN_LABS_API_KEY", env.ELEVEN_LABS_API_KEY, "Voice");
    add("ELEVEN_LABS_VOICE_ID", env.ELEVEN_LABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb");
  }

  if (env.EXA_API_KEY) {
    add("EXA_API_KEY", env.EXA_API_KEY, "Exa web search");
  }

  if (env.GITHUB_TOKEN) {
    add("GITHUB_TOKEN", env.GITHUB_TOKEN, "GitHub access");
  }

  writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  success(`Wrote ${ENV_PATH}`);
}

function copyTemplates() {
  mkdirSync(MEMORY_DIR, { recursive: true });
  try {
    const templates = readdirSync(CORE_MEMORY_DIR).filter((f) => f.endsWith(".example.qmd"));
    for (const tpl of templates) {
      const target = tpl.replace(".example.qmd", ".qmd");
      const targetPath = join(MEMORY_DIR, target);
      if (!existsSync(targetPath)) {
        copyFileSync(join(CORE_MEMORY_DIR, tpl), targetPath);
      }
    }
  } catch { /* ignore */ }
}

async function setupProfile() {
  heading("Profile Setup");
  info("profile/ will hold your memories, skills, and data (cron jobs, projects).");
  info("It's gitignored from the core repo and can be its own git repo.\n");

  mkdirSync(join(PROFILE_DIR, "context"), { recursive: true });
  mkdirSync(join(PROFILE_DIR, "memory"), { recursive: true });
  mkdirSync(join(PROFILE_DIR, "skills"), { recursive: true });
  mkdirSync(join(PROFILE_DIR, "data"), { recursive: true });
  success("Created profile/ directories");

  const profileGitignore = [
    "# Ephemeral runtime state — do not commit",
    "data/memory-index.sqlite",
    "data/memory-index.sqlite-shm",
    "data/memory-index.sqlite-wal",
    "data/sessions.json",
    "data/chat-history/",
    "data/.restart-pending",
  ].join("\n") + "\n";
  writeFileSync(join(PROFILE_DIR, ".gitignore"), profileGitignore);
  success("Wrote profile/.gitignore");

  if (!existsSync(join(PROFILE_DIR, ".git"))) {
    const wantGit = await confirm("Initialize profile/ as its own git repo?");
    if (wantGit) {
      try {
        execSync("git init", { cwd: PROFILE_DIR, stdio: "inherit" });
        success("Initialized git repo in profile/");
      } catch {
        warn("git init failed. Run it manually: cd profile && git init");
      }
    }
  } else {
    success("profile/ already has a git repo.");
  }
}

async function setupAgentContext() {
  heading("Agent Context");

  // Copy templates into place for any missing .qmd files
  copyTemplates();

  const ctx = loadExistingContext();
  const isRerun = !!(ctx.agentName || ctx.name);

  if (isRerun) {
    info("Existing agent context found. Press Enter to keep current values.\n");
  } else {
    info("Your agent has memory files that shape how it behaves.");
    info("Let's personalize the core context so the agent knows who you are.\n");
  }

  const wantContext = await confirm(isRerun ? "Review agent context?" : "Set up agent context now?");
  if (!wantContext) {
    info("Skipping. You can edit memory/*.qmd files later.");
    return;
  }

  // ── Agent identity ────────────────────────────────────────────────

  console.log("");
  info("-- About the Agent --\n");
  if (!isRerun) info("Give your agent an identity. This shapes how it introduces itself.\n");
  const agentName = await ask("Agent name", ctx.agentName || "");
  const agentRole = await ask("Agent role", ctx.agentRole || "");
  const replyStyle = await ask("How should it reply?", ctx.replyStyle || "concise and direct");
  const expertise = await ask("Areas of expertise (comma-separated)", ctx.expertise || "");

  console.log("");
  info("Anything the agent should always keep in mind?");
  if (ctx.rules.length > 0) {
    info("Current rules:");
    for (const r of ctx.rules) info(`  - ${r}`);
    console.log("");
    const keepRules = await confirm("Keep existing rules?");
    if (keepRules) {
      var rules = [...ctx.rules];
      info("Add more rules, or press Enter to continue.\n");
    } else {
      var rules = [];
      info("Enter new rules. Press Enter on an empty line when done.\n");
    }
  } else {
    var rules = [];
    info("Enter rules one per line. Press Enter on an empty line when done.\n");
  }
  while (true) {
    const rule = await ask("  Rule (blank to finish)");
    if (!rule) break;
    rules.push(rule);
  }

  // ── About the user ────────────────────────────────────────────────

  console.log("");
  info("-- About You --\n");
  const name = await ask("Your name", ctx.name || "");
  const role = await ask("Your role", ctx.role || "");
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = await ask("Your timezone", ctx.timezone || detectedTz || "");

  const rulesSection = rules.length > 0
    ? `\n# Always Consider\n\n${rules.map((r) => `- ${r}`).join("\n")}\n`
    : "";

  const baseContext = `---
title: "Agent Base Context"
description: "Always-loaded background context for your agent"
---

# Agent Identity

- Name: ${agentName || "(not set)"}
- Role: ${agentRole || "(not set)"}
- Reply style: ${replyStyle}
- Expertise: ${expertise || "(not set)"}
- Custom system prompt: ${ctx.customSystemPrompt || "(not set)"}

# About the User

- Name: ${name || "(not set)"}
- Role: ${role || "(not set)"}
- Timezone: ${timezone || "(not set)"}
${rulesSection}
# Important Contacts

- Add the people your agent should know about here

# Recurring Tasks

- Add recurring workflows, reminders, or routines here

# Notes

- This file is loaded on every interaction
- Keep it short and durable
`;

  writeFileSync(join(CONTEXT_DIR, "base-context.qmd"), baseContext);
  success("Wrote context/base-context.qmd");

  // ── goals.qmd ─────────────────────────────────────────────────────

  console.log("");
  info("-- Goals --\n");
  if (ctx.goals.length > 0) {
    info("Current goals:");
    for (const g of ctx.goals) info(`  - ${g}`);
    console.log("");
    const keepGoals = await confirm("Keep existing goals?");
    if (keepGoals) {
      var goals = [...ctx.goals];
    } else {
      var goals = [];
    }
  } else {
    var goals = [];
  }
  const wantAddGoals = await confirm(goals.length > 0 ? "Add more goals?" : "Add goals?", goals.length === 0);
  if (wantAddGoals) {
    info("Each goal can be multi-line. Enter a blank line to finish each goal.\n");
    while (true) {
      const goal = await askMultiline("Goal (blank to skip)", "");
      if (!goal) break;
      goals.push(goal);
      console.log("");
    }
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
  info("-- Key People --\n");
  if (ctx.people.length > 0) {
    info("Current people:");
    for (const p of ctx.people) info(`  - ${p.name}: ${p.note || "(no note)"}`);
    console.log("");
    const keepPeople = await confirm("Keep existing people?");
    if (keepPeople) {
      var people = [...ctx.people];
      info("Add more people, or press Enter to continue.\n");
    } else {
      var people = [];
      info("Enter people. Press Enter on an empty line when done.\n");
    }
  } else {
    var people = [];
    info("Add people your agent should know about.");
    info("Press Enter on an empty line when done.\n");
  }
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
  info("-- Projects --\n");
  if (ctx.projects.length > 0) {
    info("Current projects:");
    for (const p of ctx.projects) info(`  - ${p.name} (${p.status}): ${p.goal || "(no goal)"}`);
    console.log("");
    const keepProjects = await confirm("Keep existing projects?");
    if (keepProjects) {
      var projects = [...ctx.projects];
      info("Add more projects, or press Enter to continue.\n");
    } else {
      var projects = [];
      info("Enter projects. Press Enter on an empty line when done.\n");
    }
  } else {
    var projects = [];
    info("What are you currently working on?");
    info("Press Enter on an empty line when done.\n");
  }
  while (true) {
    const projName = await ask("  Project name (blank to finish)");
    if (!projName) break;
    const projGoal = await ask(`  What's the goal of ${projName}?`);
    const projStatus = await ask("  Status", "active");
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
  if (enabled.exa) success("Exa web search");

  console.log("");
  info("Next steps:");
  info("  1. Review and edit profile/context/*.qmd and profile/memory/*.qmd to add more context");
  info("     (Set 'Custom system prompt' in context/base-context.qmd to override the auto-generated one)");
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

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage, SDKSystemMessage, Options } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import { MEMORY_DIR, SKILLS_DIR, SESSIONS_FILE } from "../paths.js";


// Memory tools
import { readMemory, writeMemory, updateMemory, listMemories, deleteMemory } from "./tools/memory.js";
// Google tools (Gmail, Calendar, Drive, Docs, Sheets, Tasks, Contacts)
import {
  listEmails, readEmail, sendEmail, searchEmails,
  calendarList, calendarEvents, calendarGetEvent, calendarCreateEvent, calendarDeleteEvent, calendarSearch,
  driveList, driveSearch, driveGetFile, driveDownload, driveUpload, driveMkdir, driveDelete, driveShare,
  docsRead, docsCreate, docsWrite, docsInfo, docsExport,
  sheetsRead, sheetsUpdate, sheetsAppend, sheetsMetadata, sheetsCreate,
  googleTasksListLists, googleTasksList, googleTasksAdd, googleTasksDone, googleTasksDelete,
  contactsSearch, contactsList, contactsGet, contactsCreate,
} from "./tools/google.js";
// Cron tools
import { createCronJob, listCronJobs, deleteCronJob, toggleCronJob } from "./tools/cron.js";
// Project board
import {
  listProjects, getProject, createProject, updateProject,
  addTask, updateTask, deleteTask, addPart, removePart, loadBoard, getTaskCounts,
} from "./tools/projects.js";
import type { Board } from "./tools/projects.js";
// Transcription
import { transcribeAudioTool } from "./tools/transcribe.js";
// TTS
import { generateSpeechTool } from "./tools/tts.js";
// Memory search
import { searchMemory } from "./memory/index.js";
import { memorySearch } from "./tools/memory-search.js";
// Chat history
import { appendChatEntry, searchChatHistory } from "./chat-history.js";
import { searchChatHistoryTool, getRecentChatsTool } from "./tools/chat-history.js";
// Consolidation
import { consolidateSession } from "./consolidation.js";
// Skills
import { loadAllSkills } from "./skills/loader.js";
import { buildRegistry, formatRegistryForPrompt, getRegistryStats } from "./skills/registry.js";
import { loadSkillTool, initializeSkillCache } from "./skills/tools/load.js";
import { FullSkill } from "./skills/types.js";
import { getConfiguredAgentEmail } from "./tools/google.js";

const STATIC_CACHE_TTL = 60_000;
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_MAX_MESSAGES = 100;

// --- Filesystem read caching ---
let cachedBaseContext: { value: string; expiresAt: number } | null = null;
let cachedSkillRegistry: { value: string; skills: Map<string, FullSkill>; expiresAt: number } | null = null;
let cachedProjectBoard: { value: string; expiresAt: number } | null = null;

async function loadSkillRegistry(): Promise<{ registryPrompt: string; skillsCache: Map<string, FullSkill> }> {
  if (cachedSkillRegistry && Date.now() < cachedSkillRegistry.expiresAt) {
    return { registryPrompt: cachedSkillRegistry.value, skillsCache: cachedSkillRegistry.skills };
  }

  // Load all skills with hierarchical loading and gating
  const fullSkills = await loadAllSkills();

  // Build lightweight registry
  const registry = buildRegistry(fullSkills);

  // Format for system prompt
  const registryPrompt = formatRegistryForPrompt(registry);

  // Log stats
  const stats = getRegistryStats(registry);
  process.stderr.write(`[skills] Loaded ${stats.total} skills (${stats.available} available, ${stats.unavailable} unavailable)\n`);

  // Cache for 60 seconds
  cachedSkillRegistry = {
    value: registryPrompt,
    skills: fullSkills,
    expiresAt: Date.now() + STATIC_CACHE_TTL
  };

  return { registryPrompt, skillsCache: fullSkills };
}

function loadBaseContext(): string {
  if (cachedBaseContext && Date.now() < cachedBaseContext.expiresAt) {
    return cachedBaseContext.value;
  }

  const contextFile = path.join(MEMORY_DIR, "base-context.qmd");
  if (!fs.existsSync(contextFile)) return "";
  const value = fs.readFileSync(contextFile, "utf-8");
  cachedBaseContext = { value, expiresAt: Date.now() + STATIC_CACHE_TTL };
  return value;
}

function parseBaseContextField(content: string, fieldName: string): string {
  const m = content.match(new RegExp(`^- ${fieldName}:\\s*(.+)$`, "m"));
  const v = m?.[1]?.trim();
  return v && v !== "(not set)" ? v : "";
}

function buildSystemPromptOpening(baseContext: string): string {
  if (!baseContext) {
    return "You are Lightweight Agent, a personal AI assistant. You have persistent memory, full Google Workspace access, web search, cron jobs, skills, and full shell/filesystem access.";
  }

  const customPrompt = parseBaseContextField(baseContext, "Custom system prompt");
  if (customPrompt) return customPrompt;

  const name = parseBaseContextField(baseContext, "Name") || "Lightweight Agent";
  const role = parseBaseContextField(baseContext, "Role");
  const expertise = parseBaseContextField(baseContext, "Expertise");
  let opening = `You are ${name}`;
  if (role) opening += `, ${role}`;
  opening += ".";
  if (expertise) opening += ` You have deep expertise in ${expertise}.`;
  opening += " You have persistent memory, full Google Workspace access, web search, cron jobs, skills, and full shell/filesystem access.";

  return opening;
}

function loadProjectBoard(): string {
  if (cachedProjectBoard && Date.now() < cachedProjectBoard.expiresAt) {
    return cachedProjectBoard.value;
  }

  let board: Board;
  try {
    board = loadBoard();
  } catch {
    return "";
  }

  const active = board.projects.filter((p) => p.status === "active" || p.status === "paused");
  if (active.length === 0) {
    cachedProjectBoard = { value: "", expiresAt: Date.now() + STATIC_CACHE_TTL };
    return "";
  }

  const lines = active.map((p) => {
    const counts = getTaskCounts(p);
    const parts = (p.parts || []).length > 0
      ? ` | Parts: ${(p.parts || []).map((pt) => pt.name).join(", ")}`
      : "";
    const desc = p.description ? ` — ${p.description}` : "";
    return `- **${p.name}** [${p.id}] (${p.status})${desc}${parts}\n  ${p.location ? `@ \`${p.location}\` | ` : ""}Tasks: ${counts.total} (${counts.pending}p/${counts["in-progress"]}ip/${counts.completed}c/${counts.blocked}b)`;
  });

  const value = lines.join("\n");
  cachedProjectBoard = { value, expiresAt: Date.now() + STATIC_CACHE_TTL };
  return value;
}

function loadProjectInstructions(message: string): string {
  let board: Board;
  try {
    board = loadBoard();
  } catch {
    return "";
  }

  const msgLower = message.toLowerCase();
  const active = board.projects.filter((p) => p.status === "active" || p.status === "paused");

  const instructions: string[] = [];

  for (const p of active) {
    // Check if the message mentions this project by name, id, or any part name
    const terms = [p.name.toLowerCase(), p.id.toLowerCase()];
    for (const part of p.parts || []) {
      terms.push(part.name.toLowerCase());
    }
    if (!terms.some((t) => msgLower.includes(t))) continue;

    // Load project context files (CLAUDE.md, learnings.md, structure.md)
    if (p.location) {
      const contextFiles = [
        ["CLAUDE.md", "instructions"],
        ["learnings.md", "learnings"],
        ["structure.md", "structure"],
      ];
      for (const [fileName, tag] of contextFiles) {
        const filePath = path.join(p.location, fileName);
        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            if (content.trim()) {
              instructions.push(`<project-${tag} for="${p.name}">\n${content}\n</project-${tag}>`);
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    // Load CLAUDE.md from each part's location
    for (const part of p.parts || []) {
      if (!part.location || part.location.startsWith("http")) continue;
      const partClaudeMd = path.join(part.location, "CLAUDE.md");
      try {
        if (fs.existsSync(partClaudeMd)) {
          const content = fs.readFileSync(partClaudeMd, "utf-8");
          instructions.push(`<project-instructions for="${p.name}/${part.name}">\n${content}\n</project-instructions>`);
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return instructions.join("\n\n");
}

async function autoRetrieveMemories(message: string): Promise<string> {
  const results = await searchMemory(message, 5);
  if (results.length === 0) return "";

  return results
    .map((r) => `--- ${r.file} > ${r.heading} ---\n${r.content}`)
    .join("\n\n");
}

const CHAT_GIST_THRESHOLD = 0.35;

async function autoRetrieveChatGists(message: string): Promise<string> {
  try {
    const results = await searchChatHistory(message, 5);
    if (results.length === 0) {
      process.stderr.write("[chat-gist] top_score=0 injected=0\n");
      return "";
    }

    const topScore = results[0].score;
    const passing = results.filter((r) => r.score >= CHAT_GIST_THRESHOLD);

    process.stderr.write(`[chat-gist] top_score=${topScore.toFixed(3)} injected=${passing.length}\n`);

    if (passing.length === 0) return "";

    const gists = passing.map((r) => {
      const date = r.timestamp.slice(0, 10);
      const topic = r.userMessage.length > 40 ? r.userMessage.slice(0, 40) + "…" : r.userMessage;
      const summary =
        r.assistantResponse.length > 80
          ? r.assistantResponse.slice(0, 80) + "…"
          : r.assistantResponse;
      return `- [${date}] "${topic}" → ${summary}`;
    });

    return gists.join("\n");
  } catch (e) {
    process.stderr.write(`[chat-gist] Error: ${e}\n`);
    return "";
  }
}

// Create the MCP server with all custom tools
const toolServer = createSdkMcpServer({
  name: "agent-tools",
  tools: [
    // Memory
    readMemory, writeMemory, updateMemory, listMemories, deleteMemory, memorySearch,
    // Google: Gmail
    listEmails, readEmail, sendEmail, searchEmails,
    // Google: Calendar
    calendarList, calendarEvents, calendarGetEvent, calendarCreateEvent, calendarDeleteEvent, calendarSearch,
    // Google: Drive
    driveList, driveSearch, driveGetFile, driveDownload, driveUpload, driveMkdir, driveDelete, driveShare,
    // Google: Docs
    docsRead, docsCreate, docsWrite, docsInfo, docsExport,
    // Google: Sheets
    sheetsRead, sheetsUpdate, sheetsAppend, sheetsMetadata, sheetsCreate,
    // Google: Tasks
    googleTasksListLists, googleTasksList, googleTasksAdd, googleTasksDone, googleTasksDelete,
    // Google: Contacts
    contactsSearch, contactsList, contactsGet, contactsCreate,
    // Cron
    createCronJob, listCronJobs, deleteCronJob, toggleCronJob,
    // Projects
    listProjects, getProject, createProject, updateProject, addTask, updateTask, deleteTask, addPart, removePart,
    // Transcription
    transcribeAudioTool,
    // TTS
    generateSpeechTool,
    // Skills
    loadSkillTool,
    // Chat history
    searchChatHistoryTool, getRecentChatsTool,
  ],
});

// --- Session persistence ---
const sessions = new Map<string, SessionInfo>();

function saveSessions(): void {
  const data = Object.fromEntries(sessions);
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

export function loadSessions(): void {
  if (!fs.existsSync(SESSIONS_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
    for (const [key, val] of Object.entries(raw)) {
      sessions.set(key, val as SessionInfo);
    }
    process.stderr.write(`[sessions] Loaded ${sessions.size} sessions from disk\n`);
  } catch {
    process.stderr.write(`[sessions] Failed to load sessions file, starting fresh\n`);
  }
}

export function cleanupStaleSessions(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [userId, info] of sessions) {
    if (now - info.lastActivity > SESSION_TTL || info.messageCount >= SESSION_MAX_MESSAGES) {
      sessions.delete(userId);
      cleaned++;
      // Consolidate the expired session's conversation
      consolidateSession(info.sessionId).catch((e) =>
        process.stderr.write(`[consolidation] Failed for session ${info.sessionId}: ${e}\n`)
      );
      process.stderr.write(`[sessions] Expired session for ${userId} (age=${Math.round((now - info.lastActivity) / 3600000)}h, msgs=${info.messageCount})\n`);
    }
  }
  if (cleaned > 0) {
    saveSessions();
    process.stderr.write(`[sessions] Cleaned up ${cleaned} stale sessions\n`);
  }
}

export interface SessionInfo {
  sessionId: string;
  lastActivity: number;
  messageCount: number;
}

export function getActiveSessions(): number {
  return sessions.size;
}

export function getSessionInfo(userId: string): SessionInfo | null {
  return sessions.get(userId) ?? null;
}

export async function clearSession(userId: string): Promise<boolean> {
  const info = sessions.get(userId);
  if (!info) return false;
  sessions.delete(userId);
  saveSessions();
  consolidateSession(info.sessionId).catch((e) =>
    process.stderr.write(`[consolidation] Failed for session ${info.sessionId}: ${e}\n`)
  );
  return true;
}

function friendlyToolName(name: string): string {
  const map: Record<string, string> = {
    memory_search: "Searching memory…",
    read_memory: "Reading memory…",
    write_memory: "Saving to memory…",
    update_memory: "Updating memory…",
    list_memories: "Listing memories…",
    gmail_list: "Checking email…",
    gmail_read: "Reading email…",
    gmail_send: "Sending email…",
    gmail_search: "Searching email…",
    calendar_list: "Checking calendars…",
    calendar_events: "Looking up events…",
    calendar_create_event: "Creating event…",
    calendar_search: "Searching calendar…",
    drive_list: "Browsing files…",
    drive_search: "Searching Drive…",
    web_search: "Searching the web…",
    search_chat_history: "Searching past conversations…",
  };
  return map[name] ?? `Using ${name.replace(/_/g, " ")}…`;
}

export async function runAgent(
  userId: string,
  message: string,
  onStatus?: (status: string) => void
): Promise<string> {
  const baseContext = loadBaseContext();
  const projectBoard = loadProjectBoard();
  const projectInstructions = loadProjectInstructions(message);
  const [memories, chatGists] = await Promise.all([
    autoRetrieveMemories(message),
    autoRetrieveChatGists(message),
  ]);
  const { registryPrompt: skillIndex, skillsCache } = await loadSkillRegistry();
  const agentEmail = getConfiguredAgentEmail();

  // Initialize skill cache for load_skill tool
  initializeSkillCache(skillsCache);

  // System prompt ordered for maximum cacheable prefix:
  // Static sections first (Identity → Capabilities → Guidelines → Skills → Base Context),
  // dynamic section last (Relevant Memories changes per message).
  const chatGistSection = chatGists
    ? `\n\n## Past Conversations\n${chatGists}`
    : "";

  const systemPrompt = `${buildSystemPromptOpening(baseContext)}

## Agent Identity
- Primary email: ${agentEmail || "(not configured)"}

## Your Capabilities
- **Memory**: Read/write QMD files for long-term memory. Memories are automatically searched for relevance. Use memory_search for deeper queries.
- **Gmail**: List, read, search, and send emails.
- **Google Calendar**: List calendars, view/create/delete events, search events, check today/week schedules.
- **Google Drive**: List, search, upload, download, share, and manage files and folders.
- **Google Docs**: Read, create, write, export documents.
- **Google Sheets**: Read, update, append data, create spreadsheets.
- **Google Tasks**: List task lists, add/complete/delete tasks.
- **Google Contacts**: Search, list, view, and create contacts.
- **Web Search**: Search the web for current information.
- **Cron Jobs**: Create, list, toggle, and delete scheduled tasks that will trigger you on a schedule.
- **Audio Transcription**: Transcribe audio files to text. Voice messages from Telegram are automatically transcribed.
- **Text-to-Speech**: Generate voice audio from text using ElevenLabs. Use generate_speech tool and include the [[VOICE:path]] marker to send voice messages.
- **Shell**: Run any shell command via Bash. Install packages, manage services, run scripts.
- **File System**: Read, write, edit, search, and glob files anywhere on the system.
- **Skills**: Self-contained scripts in the skills/ directory. See "Available Skills" below.
- **Chat History**: All conversations are logged and auto-searched. Relevant gists appear below. Use search_chat_history for full details.
- **Project Board**: Shared project tracker (data/projects.json). Always auto-loaded. Use project tools to manage projects and tasks.
- **Subagents**: Spawn subagent tasks for parallel or complex work.

## Memory Architecture
You have three tiers of memory:

1. **Auto-injected**: Relevant QMD memories and past conversation gists appear below automatically. Check these first.
2. **Tool search**: Use memory_search, search_chat_history, or get_recent_chats when you need deeper detail or the user references something not shown below.
3. **Save to memory**: When you learn something important (preferences, decisions, project context, people, goals), save it with write_memory / update_memory so it surfaces automatically next time.

## Guidelines
- **Be concise**: Use the fewest words needed to convey the information. Prefer short lists over paragraphs. Trust the user to ask follow-ups.
- **No narration**: Skip filler like "Let me check…", "I'm searching…", "Here's what I found…". Go straight to the answer.
- **Routine ops are silent**: Don't describe tool calls or steps you're taking. Just deliver the result.
- **Expand only when asked**: If the user wants more detail, they'll ask. Default to the shortest useful answer.
- When you learn something important about the user, save it to memory.
- For cron job actions, write clear prompts that you'll understand when triggered later.
- Always confirm before sending emails.
- When starting or completing work on a project, update the project board to reflect current status.
- **Creating projects**: When the user asks to create a new project, ask clarifying questions first before calling create_project. Ask about: what the project is (purpose/goal), tech stack if it's a code project, key components or parts, any conventions or constraints. Use the answers to: (1) set a brief one-line description on the project board, and (2) populate the project files with real content based on their answers. The project board is just a lightweight index — keep it slim. All detailed context belongs in the project directory.
- **Project structure**: Every project has a standard directory layout. All files are auto-loaded when the project is mentioned. If a file is missing, the project still works — you just won't have that context. If you need it, ask the user and recreate it.
  - \`CLAUDE.md\` — Project overview, tech stack, conventions, architecture. Your primary reference for how to work on this project. Update it when the user shares relevant decisions.
  - \`tasks.json\` — Structured task list (managed via add_task/update_task/delete_task tools). Machine-readable.
  - \`learnings.md\` — Discoveries, gotchas, edge cases, debugging notes. Update this when you learn something non-obvious while working on the project — things that would save time if you encountered them again.
  - \`structure.md\` — Project layout, module boundaries, key file paths. Update this when the project structure changes or when you map out a new area of the codebase.
- **Working on a project**: When you start working on a project, all its context files are already in your prompt. Read them to get up to speed quickly. When you finish a task or learn something new, update the relevant file (learnings.md for discoveries, structure.md for layout changes, CLAUDE.md for convention/architecture changes). This keeps the project context fresh for future conversations.
- **Project parts**: Projects can have multiple parts (repos, marketing sites, knowledge bases, design systems, etc.) via add_part. Each part has a name, type, location, and optional notes. Parts with filesystem locations get their own CLAUDE.md auto-loaded.

${skillIndex || "(No skills available. Skills can be added to bundled, managed, or workspace directories.)"}

## Base Context
${baseContext || "(No base context configured yet. User can add memory/base-context.qmd)"}

## Project Board
${projectBoard || "(No active projects. Use project tools to create and manage projects.)"}
${projectInstructions ? `\n## Active Project Instructions\n${projectInstructions}` : ""}
## Relevant Memories
${memories || "(No relevant memories found. Use memory_search for deeper queries.)"}${chatGistSection}`;

  const sessionInfo = sessions.get(userId);
  let sessionId = sessionInfo?.sessionId;

  // Check session expiry
  if (sessionInfo) {
    const now = Date.now();
    if (now - sessionInfo.lastActivity > SESSION_TTL || sessionInfo.messageCount >= SESSION_MAX_MESSAGES) {
      process.stderr.write(`[sessions] Session expired for ${userId}, starting fresh\n`);
      sessions.delete(userId);
      saveSessions();
      sessionId = undefined;
    }
  }

  const options: Options = {
    systemPrompt,
    maxBudgetUsd: 30.00,
    allowedTools: [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "Task",
    ],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    mcpServers: {
      agent: toolServer,
      ...(process.env.EXA_API_KEY
        ? { exa: { type: "http" as const, url: `https://mcp.exa.ai/mcp?exaApiKey=${process.env.EXA_API_KEY}` } }
        : {}),
      ...(process.env.GITHUB_TOKEN
        ? {
            github: {
              type: "stdio" as const,
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-github"],
              env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
            },
          }
        : {}),
    },
    maxTurns: 100,
    stderr: (data: string) => process.stderr.write(`[agent] ${data}\n`),
    ...(sessionId ? { resume: sessionId } : {}),
  };

  let result = "";

  function logExchange(response: string): string {
    const sid = sessions.get(userId)?.sessionId ?? userId;
    appendChatEntry(sid, {
      timestamp: new Date().toISOString(),
      userId,
      userMessage: message,
      assistantResponse: response,
    }).catch((e) => {
      process.stderr.write(`[chat-history] Failed to log exchange: ${e}\n`);
    });
    return response;
  }

  async function executeQuery(opts: Options): Promise<string> {
    for await (const msg of query({ prompt: message, options: opts })) {
      // Capture session ID for future resumption
      if (msg.type === "system" && (msg as SDKSystemMessage).subtype === "init") {
        sessions.set(userId, {
          sessionId: msg.session_id,
          lastActivity: Date.now(),
          messageCount: (sessions.get(userId)?.messageCount ?? 0) + 1,
        });
        saveSessions();
        onStatus?.("Thinking…");
      }

      // Log tool use
      if (msg.type === "tool_use_summary") {
        process.stderr.write(`[tool] ${(msg as any).summary}\n`);
      }
      // Log assistant messages that contain tool_use blocks
      if (msg.type === "assistant") {
        const content = (msg as any).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              process.stderr.write(`[tool-call] ${block.name}(${JSON.stringify(block.input).slice(0, 200)})\n`);
              onStatus?.(friendlyToolName(block.name));
            }
          }
        }
      }

      // Capture final result + token usage logging
      if (msg.type === "result") {
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.subtype === "success") {
          result = resultMsg.result;
        } else if (resultMsg.subtype === "error_max_turns") {
          result = "I hit my processing limit on that one. Could you try breaking it into smaller steps, or send a follow-up to continue?";
        } else {
          result = `Error: ${resultMsg.subtype}` +
            ("errors" in resultMsg ? `\n${resultMsg.errors.join("\n")}` : "");
        }
        // Log token usage from modelUsage (aggregated across all models)
        const models = resultMsg.modelUsage;
        const totals = Object.values(models).reduce(
          (acc, m) => ({
            input: acc.input + m.inputTokens,
            output: acc.output + m.outputTokens,
            cacheRead: acc.cacheRead + m.cacheReadInputTokens,
            cacheWrite: acc.cacheWrite + m.cacheCreationInputTokens,
          }),
          { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        );
        process.stderr.write(
          `[tokens] in=${totals.input} out=${totals.output} cache_read=${totals.cacheRead} cache_write=${totals.cacheWrite} cost=$${resultMsg.total_cost_usd?.toFixed(4)}\n`
        );
      }
    }
    return result;
  }

  try {
    await executeQuery(options);
  } catch (err: any) {
    // If resume fails (stale/corrupted session), retry without resume
    if (sessionId && !result) {
      process.stderr.write(`[sessions] Resume failed for ${userId}, retrying fresh: ${err.message}\n`);
      sessions.delete(userId);
      saveSessions();
      const freshOptions = { ...options };
      delete freshOptions.resume;
      try {
        await executeQuery(freshOptions);
      } catch (retryErr: any) {
        if (result) return logExchange(result);
        throw retryErr;
      }
    } else if (result) {
      return logExchange(result);
    } else {
      throw err;
    }
  }

  return logExchange(result || "(No response generated)");
}

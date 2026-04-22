import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage, SDKSystemMessage, Options } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import { CONTEXT_DIR, MEMORY_DIR, SKILLS_DIR, SESSIONS_FILE, ROOT } from "../paths.js";


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
// Inter-agent delegation
import { delegateToAgent } from "./tools/delegate.js";
// Chat history
import { appendChatEntry, searchChatHistory } from "./chat-history.js";
// Event log
import { pushEvent } from "./events.js";
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
const SESSION_MAX_MESSAGES = 40;

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

  const contextParts: string[] = [];

  // Primary: load all .qmd files from profile/context/
  if (fs.existsSync(CONTEXT_DIR)) {
    const files = fs.readdirSync(CONTEXT_DIR)
      .filter((f) => f.endsWith(".qmd"))
      .sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(CONTEXT_DIR, file), "utf-8");
      if (content.trim()) contextParts.push(content);
    }
  }

  // Backwards compat: fall back to memory/base-context.qmd if context/ is empty
  if (contextParts.length === 0) {
    const legacyFile = path.join(MEMORY_DIR, "base-context.qmd");
    if (fs.existsSync(legacyFile)) {
      contextParts.push(fs.readFileSync(legacyFile, "utf-8"));
    }
  }

  const value = contextParts.join("\n\n---\n\n");
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

async function autoRetrieveMemories(
  message: string
): Promise<{ prompt: string; hits: { file: string; heading: string; score: number }[] }> {
  const results = await searchMemory(message, 5);
  if (results.length === 0) return { prompt: "", hits: [] };

  const prompt = results
    .map((r) => `--- ${r.file} > ${r.heading} ---\n${r.content}`)
    .join("\n\n");
  const hits = results.map((r) => ({ file: r.file, heading: r.heading, score: r.score }));
  return { prompt, hits };
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

// All custom tools — listed once, instantiated into a fresh MCP server per run
// to avoid "Already connected to a transport" errors when cron runs overlap.
const agentTools = [
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
  // Inter-agent delegation
  delegateToAgent,
];

function createToolServer() {
  return createSdkMcpServer({ name: "agent-tools", tools: agentTools });
}

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

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "tool"; name: string; input?: unknown }
  | { type: "memory_hit"; path: string; heading: string; score: number }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      costUsd: number;
    };

// Never let an event-emission failure bubble up into the SDK's async iterator —
// the SDK treats synchronous throws inside its work loop as "error_during_execution".
function safeEmit(
  cb: ((event: AgentEvent) => void) | undefined,
  event: AgentEvent,
): void {
  if (!cb) return;
  try {
    cb(event);
  } catch (e: any) {
    process.stderr.write(`[agent-event] emit failed (${event.type}): ${e?.message ?? e}\n`);
  }
}

function safePush(
  kind: Parameters<typeof pushEvent>[0],
  payload: Parameters<typeof pushEvent>[1],
  userId?: string,
): void {
  try {
    pushEvent(kind, payload, userId);
  } catch (e: any) {
    process.stderr.write(`[agent-event] push failed (${kind}): ${e?.message ?? e}\n`);
  }
}

function safePreview(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    try {
      return String(value);
    } catch {
      return "(unserializable)";
    }
  }
}

export async function runAgent(
  userId: string,
  message: string,
  onEvent?: (event: AgentEvent) => void
): Promise<string> {
  const emitStatus = (text: string) => safeEmit(onEvent, { type: "status", text });

  const baseContext = loadBaseContext();
  const projectBoard = loadProjectBoard();
  const projectInstructions = loadProjectInstructions(message);
  const [memoriesResult, chatGists] = await Promise.all([
    autoRetrieveMemories(message),
    autoRetrieveChatGists(message),
  ]);
  const memories = memoriesResult.prompt;
  for (const hit of memoriesResult.hits) {
    safeEmit(onEvent, { type: "memory_hit", path: hit.file, heading: hit.heading, score: hit.score });
    safePush("memory", { path: hit.file, heading: hit.heading, score: hit.score }, userId);
  }
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
- Channel: ${userId.startsWith("telegram:") ? "Telegram" : userId.startsWith("cron:") ? "Cron" : "Web"}

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

## Working Directory
Your working directory is \`${ROOT}\`.
When you write, read, edit, or glob files using bare or relative paths like \`docs/sci/research/foo.md\`, they resolve under this directory — that relative path means \`${ROOT}/docs/sci/research/foo.md\`. Do not write to the user's home directory or anywhere outside this root unless the user or an active skill explicitly names an absolute path or a different project location (for example, when working on a separate project whose location is declared on the project board or named by the user).

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

## Always-Loaded Context
${baseContext || "(No context configured. Add .qmd files to profile/context/)"}

## Project Board
${projectBoard || "(No active projects. Use project tools to create and manage projects.)"}
${projectInstructions ? `\n## Active Project Instructions\n${projectInstructions}` : ""}
## Relevant Memories
${memories || "(No relevant memories found. Use memory_search for deeper queries.)"}${chatGistSection}`;

  // Cron jobs are stateless — GitHub is the source of truth, not session history.
  // Always start a fresh session for cron runs to prevent context bias.
  if (userId.startsWith("cron:")) {
    sessions.delete(userId);
    saveSessions();
  }

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
    cwd: ROOT,
    systemPrompt,
    maxBudgetUsd: 8.00,
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
      agent: createToolServer(),
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
      ...(process.env.VERCEL_TOKEN
        ? {
            vercel: {
              type: "http" as const,
              url: "https://mcp.vercel.com",
              headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
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
    let msgCount = 0;
    process.stderr.write(`[agent-run] start userId=${userId} resume=${opts.resume ?? "(fresh)"} mcp=${Object.keys(opts.mcpServers ?? {}).join(",")}\n`);
    try {
    for await (const msg of query({ prompt: message, options: opts })) {
      msgCount++;
      if (!msg || typeof msg !== "object" || typeof (msg as any).type !== "string") {
        process.stderr.write(`[agent-run] skipped malformed msg #${msgCount}: ${safePreview(msg)}\n`);
        continue;
      }

      // Capture session ID for future resumption
      if (msg.type === "system" && (msg as SDKSystemMessage).subtype === "init") {
        sessions.set(userId, {
          sessionId: msg.session_id,
          lastActivity: Date.now(),
          messageCount: (sessions.get(userId)?.messageCount ?? 0) + 1,
        });
        saveSessions();
        emitStatus("Thinking…");
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
            if (!block || typeof block !== "object" || typeof (block as any).type !== "string") continue;
            if (block.type === "tool_use") {
              const name: string = typeof block.name === "string" ? block.name : "(unknown)";
              const inputPreview = safePreview(block.input);
              process.stderr.write(`[tool-call] ${name}(${inputPreview.slice(0, 200)})\n`);
              safeEmit(onEvent, { type: "tool", name, input: block.input });
              safePush("tool", { name, input: block.input }, userId);
              emitStatus(friendlyToolName(name));
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
          const rawErrors = "errors" in resultMsg ? (resultMsg as any).errors : undefined;
          const errorDetail = Array.isArray(rawErrors) ? rawErrors.join("\n") : "";
          const numTurns = (resultMsg as any).num_turns ?? 0;
          // Loud stderr log so we can actually debug these in server output.
          process.stderr.write(
            `[agent-error] subtype=${resultMsg.subtype} stop=${(resultMsg as any).stop_reason ?? "?"} turns=${numTurns}\n${errorDetail || "(no errors array)"}\n`,
          );
          // Surface in the rolling event log so it shows in the UI's Logs drawer.
          safePush(
            "error",
            {
              subtype: resultMsg.subtype,
              message: errorDetail || `(${resultMsg.subtype})`,
              stopReason: (resultMsg as any).stop_reason,
              numTurns,
            },
            userId,
          );
          // Stale/corrupted session detection: if we were resuming and the child process
          // errored before any turn (typical signature: "error_during_execution" at
          // turns=0 with an internal TypeError, or the classic "No conversation found"),
          // drop the session reference and throw so the outer catch retries fresh.
          const looksLikeStaleSession =
            sessionId &&
            (errorDetail.includes("No conversation found with session ID") ||
              (resultMsg.subtype === "error_during_execution" && numTurns === 0));
          if (looksLikeStaleSession) {
            throw new Error(`stale_session: ${errorDetail || resultMsg.subtype}`);
          }
          result = `Error: ${resultMsg.subtype}` +
            (errorDetail ? `\n${errorDetail}` : "");
        }
        // Log token usage from modelUsage (aggregated across all models). Guard against
        // missing/partial usage on error results.
        const models = (resultMsg as any).modelUsage;
        const totals = models && typeof models === "object"
          ? Object.values(models as Record<string, any>).reduce(
              (acc, m: any) => ({
                input: acc.input + (m?.inputTokens ?? 0),
                output: acc.output + (m?.outputTokens ?? 0),
                cacheRead: acc.cacheRead + (m?.cacheReadInputTokens ?? 0),
                cacheWrite: acc.cacheWrite + (m?.cacheCreationInputTokens ?? 0),
              }),
              { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            )
          : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        const costUsd = (resultMsg as any).total_cost_usd ?? 0;
        process.stderr.write(
          `[tokens] in=${totals.input} out=${totals.output} cache_read=${totals.cacheRead} cache_write=${totals.cacheWrite} cost=$${typeof costUsd === "number" ? costUsd.toFixed(4) : "0"}\n`,
        );
        safeEmit(onEvent, {
          type: "usage",
          inputTokens: totals.input,
          outputTokens: totals.output,
          cacheReadTokens: totals.cacheRead,
          cacheWriteTokens: totals.cacheWrite,
          costUsd,
        });
        safePush(
          "usage",
          {
            inputTokens: totals.input,
            outputTokens: totals.output,
            cacheReadTokens: totals.cacheRead,
            cacheWriteTokens: totals.cacheWrite,
            costUsd,
          },
          userId,
        );
      }
    }
    process.stderr.write(`[agent-run] done msgs=${msgCount} result_len=${result.length}\n`);
    return result;
    } catch (iterErr: any) {
      process.stderr.write(
        `[agent-run] iterator threw after ${msgCount} msgs: ${iterErr?.message ?? iterErr}\n` +
          `STACK:\n${iterErr?.stack ?? "(no stack)"}\n`,
      );
      safePush(
        "error",
        { subtype: "iterator_threw", message: iterErr?.message ?? String(iterErr) },
        userId,
      );
      throw iterErr;
    }
  }

  try {
    await executeQuery(options);
  } catch (err: any) {
    const msg: string = err?.message ?? "";
    // Retry fresh if: (a) we were resuming and the run produced no usable result, OR
    // (b) we explicitly detected a stale/corrupted session signature (even if an
    // error result was stored, we discard it and try again without resume).
    const isStale = msg.startsWith("stale_session:");
    if (sessionId && (isStale || !result)) {
      process.stderr.write(
        `[sessions] Resume failed for ${userId}, retrying fresh (reason=${isStale ? "stale" : "no_result"}): ${msg}\n`,
      );
      sessions.delete(userId);
      saveSessions();
      result = ""; // discard any poisoned error-string captured during the bad run
      const freshOptions: Options = { ...options };
      delete (freshOptions as any).resume;
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

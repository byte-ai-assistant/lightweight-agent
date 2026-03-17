import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getDb } from "./memory/index.js";
import { indexFile } from "./memory/index.js";

const MEMORY_DIR = path.resolve("memory");
const HISTORY_DIR = path.resolve("data/chat-history");

// ── Schema ────────────────────────────────────────────────────────────

let schemaReady = false;

function ensureConsolidationSchema(): void {
  if (schemaReady) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS consolidated_sessions (
      session_id      TEXT PRIMARY KEY,
      consolidated_at TEXT NOT NULL
    );
  `);

  schemaReady = true;
}

// ── Queue (serialize concurrent calls) ────────────────────────────────

let consolidationQueue: Promise<void> = Promise.resolve();

// ── Helpers ───────────────────────────────────────────────────────────

const QMD_FILES = ["preferences.qmd", "projects.qmd", "people.qmd", "decisions.qmd", "goals.qmd"];

function loadExistingMemories(): string {
  const sections: string[] = [];
  for (const file of QMD_FILES) {
    const filePath = path.join(MEMORY_DIR, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content) {
        sections.push(`=== ${file} ===\n${content}`);
      }
    }
  }
  return sections.length > 0 ? sections.join("\n\n") : "(No existing memories)";
}

interface ParsedUpdate {
  file: string;
  section: string;
  items: string[];
}

function parseExtractionOutput(output: string): ParsedUpdate[] {
  if (output.includes("NOTHING_TO_EXTRACT")) return [];

  const updates: ParsedUpdate[] = [];
  let currentFile = "";
  let currentSection = "";
  let currentItems: string[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    const fileMatch = trimmed.match(/^FILE:\s*(.+)/);
    if (fileMatch) {
      // Flush previous
      if (currentFile && currentSection && currentItems.length > 0) {
        updates.push({ file: currentFile, section: currentSection, items: [...currentItems] });
      }
      currentFile = fileMatch[1].trim();
      currentSection = "";
      currentItems = [];
      continue;
    }

    const sectionMatch = trimmed.match(/^SECTION:\s*(.+)/);
    if (sectionMatch) {
      // Flush previous section (same file, different section)
      if (currentFile && currentSection && currentItems.length > 0) {
        updates.push({ file: currentFile, section: currentSection, items: [...currentItems] });
      }
      currentSection = sectionMatch[1].trim();
      currentItems = [];
      continue;
    }

    if (trimmed.startsWith("- ") && currentFile && currentSection) {
      currentItems.push(trimmed);
    }
  }

  // Flush last
  if (currentFile && currentSection && currentItems.length > 0) {
    updates.push({ file: currentFile, section: currentSection, items: [...currentItems] });
  }

  return updates;
}

function applyUpdates(updates: ParsedUpdate[]): Set<string> {
  const modifiedFiles = new Set<string>();
  fs.mkdirSync(MEMORY_DIR, { recursive: true });

  for (const update of updates) {
    // Validate file name
    if (!QMD_FILES.includes(update.file)) continue;

    const filePath = path.join(MEMORY_DIR, update.file);
    let content = "";
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf-8");
    }

    const sectionHeader = `## ${update.section}`;
    const newItems = update.items.join("\n");

    if (content.includes(sectionHeader)) {
      // Find the section and append items before the next section or EOF
      const sectionIdx = content.indexOf(sectionHeader);
      const afterHeader = sectionIdx + sectionHeader.length;

      // Find the next ## section
      const nextSectionIdx = content.indexOf("\n## ", afterHeader);
      const insertAt = nextSectionIdx !== -1 ? nextSectionIdx : content.length;

      // Check for duplicates: only add items not already present
      const existingSection = content.slice(afterHeader, insertAt);
      const newUniqueItems = update.items.filter((item) => !existingSection.includes(item));

      if (newUniqueItems.length > 0) {
        const insertion = "\n" + newUniqueItems.join("\n");
        content = content.slice(0, insertAt) + insertion + content.slice(insertAt);
        modifiedFiles.add(update.file);
      }
    } else {
      // Add new section
      const section = `\n\n${sectionHeader}\n${newItems}`;
      content = content.trimEnd() + section + "\n";
      modifiedFiles.add(update.file);
    }

    if (modifiedFiles.has(update.file)) {
      fs.writeFileSync(filePath, content);
    }
  }

  return modifiedFiles;
}

// ── Session Consolidation ─────────────────────────────────────────────

export function consolidateSession(sessionId: string): Promise<void> {
  const task = consolidationQueue.then(() => doConsolidateSession(sessionId));
  consolidationQueue = task.catch(() => {}); // keep queue moving on failure
  return task;
}

async function doConsolidateSession(sessionId: string): Promise<void> {
  {
    ensureConsolidationSchema();
    const db = getDb();

    // Check if already consolidated
    const existing = db.prepare("SELECT 1 FROM consolidated_sessions WHERE session_id = ?").get(sessionId);
    if (existing) {
      process.stderr.write(`[consolidation] Session ${sessionId} already consolidated, skipping\n`);
      return;
    }

    // Read JSONL file
    const filePath = path.join(HISTORY_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`[consolidation] No JSONL file for session ${sessionId}, skipping\n`);
      return;
    }

    const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      process.stderr.write(`[consolidation] Empty JSONL file for session ${sessionId}, skipping\n`);
      return;
    }

    const entries = lines.map((line) => JSON.parse(line) as { userMessage: string; assistantResponse: string });

    process.stderr.write(`[consolidation] Processing session ${sessionId} (${entries.length} exchanges)\n`);

    // Format conversation
    const conversationText = entries
      .map((e) => `User: ${e.userMessage}\nAssistant: ${e.assistantResponse}`)
      .join("\n---\n");

    // Load existing memories to avoid duplication
    const existingMemories = loadExistingMemories();

    // Call Haiku for extraction
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      process.stderr.write("[consolidation] No ANTHROPIC_API_KEY, skipping\n");
      return;
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You extract durable facts from conversations into structured memory files.

Rules:
- Only extract DURABLE facts: preferences, decisions, project context, people, relationships, goals
- Skip: transient requests, small talk, information the user was asking about (not stating), debugging steps, one-off tasks
- Don't duplicate anything already in existing memories
- Output structured blocks in this exact format:

FILE: preferences.qmd
SECTION: Communication Style
- Prefers concise, direct responses
- Likes technical depth when asked

FILE: projects.qmd
SECTION: Trading Bot
- Building a trading bot at ~/trading-bot
- Uses TypeScript with Deno runtime

Available files and their purposes:
- preferences.qmd: Tastes, tool preferences, communication style
- projects.qmd: Active projects, tech stacks, architecture decisions
- people.qmd: People mentioned, relationships, context about them
- decisions.qmd: Choices made, trade-offs discussed, rationale
- goals.qmd: Short/long-term goals, plans, aspirations

If nothing is worth extracting, output exactly: NOTHING_TO_EXTRACT`,
      messages: [
        {
          role: "user",
          content: `## Existing Memories\n${existingMemories}\n\n## Recent Conversations\n${conversationText}`,
        },
      ],
    });

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Parse and apply updates
    const updates = parseExtractionOutput(output);

    if (updates.length === 0) {
      process.stderr.write(`[consolidation] Nothing to extract from session ${sessionId}\n`);
    } else {
      const modifiedFiles = applyUpdates(updates);

      // Re-index modified files
      for (const file of modifiedFiles) {
        await indexFile(file);
      }

      process.stderr.write(
        `[consolidation] Consolidated session ${sessionId} — updated ${modifiedFiles.size} files: ${[...modifiedFiles].join(", ")}\n`
      );
    }

    // Mark session as consolidated
    db.prepare("INSERT INTO consolidated_sessions (session_id, consolidated_at) VALUES (?, ?)").run(
      sessionId,
      new Date().toISOString()
    );
  }
}

export async function consolidateUnprocessedSessions(): Promise<void> {
  ensureConsolidationSchema();

  // List all JSONL files
  if (!fs.existsSync(HISTORY_DIR)) {
    process.stderr.write("[consolidation] No chat-history directory, nothing to consolidate\n");
    return;
  }

  const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    process.stderr.write("[consolidation] No session files to consolidate\n");
    return;
  }

  // Get already-consolidated session IDs
  const db = getDb();
  const consolidated = new Set(
    (db.prepare("SELECT session_id FROM consolidated_sessions").all() as { session_id: string }[]).map(
      (r) => r.session_id
    )
  );

  const pending = files
    .map((f) => f.replace(".jsonl", ""))
    .filter((id) => !consolidated.has(id));

  if (pending.length === 0) {
    process.stderr.write("[consolidation] All sessions already consolidated\n");
    return;
  }

  process.stderr.write(`[consolidation] Found ${pending.length} un-consolidated sessions\n`);

  for (const sessionId of pending) {
    await consolidateSession(sessionId);
  }
}

import fs from "fs";
import path from "path";
import { getDb, getEmbedding } from "./memory/index.js";
import { HISTORY_DIR } from "../paths.js";

export interface ChatEntry {
  timestamp: string;
  userId: string;
  userMessage: string;
  assistantResponse: string;
}

export interface ChatSearchResult extends ChatEntry {
  score: number;
}

// ── Schema ───────────────────────────────────────────────────────────

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_entries (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp          TEXT NOT NULL,
      user_id            TEXT NOT NULL,
      user_message       TEXT NOT NULL,
      assistant_response TEXT NOT NULL,
      embedding          BLOB
    );
  `);

  // Migrate: recreate FTS5 table if it's missing content='chat_entries'
  const ftsSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_entries_fts'"
  ).get() as { sql: string } | undefined;
  if (ftsSchema && !ftsSchema.sql.includes("content='chat_entries'")) {
    db.exec(`
      DROP TRIGGER IF EXISTS chat_ai;
      DROP TRIGGER IF EXISTS chat_ad;
      DROP TABLE IF EXISTS chat_entries_fts;
    `);
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chat_entries_fts
      USING fts5(user_message, assistant_response, content='chat_entries', content_rowid='id', tokenize='porter unicode61');

    CREATE TRIGGER IF NOT EXISTS chat_ai AFTER INSERT ON chat_entries BEGIN
      INSERT INTO chat_entries_fts(rowid, user_message, assistant_response)
        VALUES (new.id, new.user_message, new.assistant_response);
    END;

    CREATE TRIGGER IF NOT EXISTS chat_ad AFTER DELETE ON chat_entries BEGIN
      INSERT INTO chat_entries_fts(chat_entries_fts, rowid, user_message, assistant_response)
        VALUES ('delete', old.id, old.user_message, old.assistant_response);
    END;
  `);

  if (ftsSchema && !ftsSchema.sql.includes("content='chat_entries'")) {
    db.exec("INSERT INTO chat_entries_fts(chat_entries_fts) VALUES('rebuild')");
  }

  schemaReady = true;
}

// ── Append ───────────────────────────────────────────────────────────

export async function appendChatEntry(sessionId: string, entry: ChatEntry): Promise<void> {
  // JSONL append (durable log)
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const filePath = path.join(HISTORY_DIR, `${sessionId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");

  // SQLite + embedding insert
  ensureSchema();
  const db = getDb();
  const combined = `${entry.userMessage}\n${entry.assistantResponse}`;
  const embedding = await getEmbedding(combined);
  const embeddingBlob = embedding ? Buffer.from(embedding.buffer) : null;

  db.prepare(
    "INSERT INTO chat_entries (timestamp, user_id, user_message, assistant_response, embedding) VALUES (?, ?, ?, ?, ?)"
  ).run(entry.timestamp, entry.userId, entry.userMessage, entry.assistantResponse, embeddingBlob);
}

// ── Recent ───────────────────────────────────────────────────────────

export function getRecentChats(limit = 20): ChatEntry[] {
  ensureSchema();
  const db = getDb();

  const rows = db.prepare(
    "SELECT timestamp, user_id, user_message, assistant_response FROM chat_entries ORDER BY timestamp DESC LIMIT ?"
  ).all(limit) as { timestamp: string; user_id: string; user_message: string; assistant_response: string }[];

  return rows.map((r) => ({
    timestamp: r.timestamp,
    userId: r.user_id,
    userMessage: r.user_message,
    assistantResponse: r.assistant_response,
  }));
}

// ── Search ───────────────────────────────────────────────────────────

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function searchChatHistory(queryText: string, limit = 20): Promise<ChatSearchResult[]> {
  ensureSchema();
  const db = getDb();

  const allEntries = db.prepare(
    "SELECT id, timestamp, user_id, user_message, assistant_response, embedding FROM chat_entries"
  ).all() as {
    id: number; timestamp: string; user_id: string;
    user_message: string; assistant_response: string; embedding: Buffer | null;
  }[];

  if (allEntries.length === 0) return [];

  // BM25 search
  const queryWords = queryText
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"`)
    .join(" OR ");

  const bm25Scores = new Map<number, number>();
  if (queryWords) {
    const ftsRows = db.prepare(
      "SELECT rowid, rank FROM chat_entries_fts WHERE chat_entries_fts MATCH ? ORDER BY rank"
    ).all(queryWords) as { rowid: number; rank: number }[];

    if (ftsRows.length > 0) {
      const minRank = ftsRows[ftsRows.length - 1].rank;
      const maxRank = ftsRows[0].rank;
      const range = maxRank - minRank || 1;

      for (const row of ftsRows) {
        bm25Scores.set(row.rowid, (row.rank - minRank) / range);
      }
    }
  }

  // Vector search
  const queryEmbedding = await getEmbedding(queryText);
  const hasVectors = queryEmbedding !== null;

  // Score and rank
  const scored: ChatSearchResult[] = [];

  for (const entry of allEntries) {
    let vectorScore = 0;
    if (hasVectors && entry.embedding) {
      const entryEmb = new Float64Array(entry.embedding.buffer, entry.embedding.byteOffset, entry.embedding.byteLength / 8);
      vectorScore = Math.max(0, cosineSimilarity(queryEmbedding!, entryEmb));
    }

    const bm25Score = bm25Scores.get(entry.id) ?? 0;

    let score: number;
    if (hasVectors) {
      score = 0.7 * vectorScore + 0.3 * bm25Score;
    } else {
      score = bm25Score;
    }

    if (score > 0) {
      scored.push({
        timestamp: entry.timestamp,
        userId: entry.user_id,
        userMessage: entry.user_message,
        assistantResponse: entry.assistant_response,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

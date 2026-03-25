import Database from "better-sqlite3";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { MEMORY_DIR, DATA_DIR, DB_PATH } from "../../paths.js";
const BASE_CONTEXT = "base-context.qmd";

export interface SearchResult {
  file: string;
  heading: string;
  content: string;
  score: number;
}

// ── Database ────────────────────────────────────────────────────────

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      file      TEXT NOT NULL,
      heading   TEXT NOT NULL,
      content   TEXT NOT NULL,
      embedding BLOB,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate: recreate FTS5 table if it's missing content='chunks' (contentless → content-synced)
  const ftsSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
  ).get() as { sql: string } | undefined;
  if (ftsSchema && !ftsSchema.sql.includes("content='chunks'")) {
    db.exec(`
      DROP TRIGGER IF EXISTS chunks_ai;
      DROP TRIGGER IF EXISTS chunks_ad;
      DROP TRIGGER IF EXISTS chunks_au;
      DROP TABLE IF EXISTS chunks_fts;
    `);
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
      USING fts5(content, content='chunks', content_rowid='id', tokenize='porter unicode61');

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);

  // Rebuild FTS index to sync with content table
  if (ftsSchema && !ftsSchema.sql.includes("content='chunks'")) {
    db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
  }

  return db;
}

// ── Chunking ────────────────────────────────────────────────────────

export function chunkQmdFile(text: string): { heading: string; content: string }[] {
  // Strip YAML frontmatter
  let body = text;
  if (body.startsWith("---")) {
    const endIdx = body.indexOf("---", 3);
    if (endIdx !== -1) {
      body = body.slice(endIdx + 3).trim();
    }
  }

  const sections: { heading: string; content: string }[] = [];
  const parts = body.split(/^(##\s+.+)$/m);

  let currentHeading = "(intro)";
  let currentContent = "";

  for (const part of parts) {
    if (/^##\s+/.test(part)) {
      if (currentContent.trim()) {
        sections.push({ heading: currentHeading, content: currentContent.trim() });
      }
      currentHeading = part.replace(/^##\s+/, "").trim();
      currentContent = "";
    } else {
      currentContent += part;
    }
  }

  if (currentContent.trim()) {
    sections.push({ heading: currentHeading, content: currentContent.trim() });
  }

  return sections;
}

// ── Embeddings ──────────────────────────────────────────────────────

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (openai) return openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  openai = new OpenAI({ apiKey: key });
  return openai;
}

export async function getEmbedding(text: string): Promise<Float64Array | null> {
  const client = getOpenAI();
  if (!client) return null;

  try {
    const resp = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return new Float64Array(resp.data[0].embedding);
  } catch {
    return null;
  }
}

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

// ── Indexing ────────────────────────────────────────────────────────

export async function indexFile(filename: string): Promise<void> {
  if (filename === BASE_CONTEXT) return;

  const filePath = path.join(MEMORY_DIR, filename);
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf-8");
  const chunks = chunkQmdFile(text);
  const now = new Date().toISOString();
  const database = getDb();

  // Fetch embeddings before touching the database
  const prepared: { heading: string; content: string; embedding: Buffer | null }[] = [];
  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.content);
    const embeddingBlob = embedding ? Buffer.from(embedding.buffer) : null;
    prepared.push({ heading: chunk.heading, content: chunk.content, embedding: embeddingBlob });
  }

  // Atomic transaction: delete old chunks + insert new ones
  const insert = database.prepare(
    "INSERT INTO chunks (file, heading, content, embedding, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  database.transaction(() => {
    database.prepare("DELETE FROM chunks WHERE file = ?").run(filename);
    for (const chunk of prepared) {
      insert.run(filename, chunk.heading, chunk.content, chunk.embedding, now);
    }
  })();
}

export function removeFileFromIndex(filename: string): void {
  getDb().prepare("DELETE FROM chunks WHERE file = ?").run(filename);
}

export async function initMemoryIndex(): Promise<void> {
  const database = getDb();

  if (!fs.existsSync(MEMORY_DIR)) {
    console.log("Memory index ready. (no memory directory)");
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(
    (f) => f.endsWith(".qmd") && f !== BASE_CONTEXT
  );

  // Get currently indexed files and their timestamps
  const indexed = new Map<string, string>();
  const rows = database.prepare("SELECT DISTINCT file, MAX(updated_at) as updated_at FROM chunks GROUP BY file").all() as { file: string; updated_at: string }[];
  for (const row of rows) {
    indexed.set(row.file, row.updated_at);
  }

  // Index new or modified files
  for (const file of files) {
    const filePath = path.join(MEMORY_DIR, file);
    const stat = fs.statSync(filePath);
    const fileModified = stat.mtime.toISOString();
    const indexedAt = indexed.get(file);

    if (!indexedAt || fileModified > indexedAt) {
      await indexFile(file);
    }
  }

  // Remove stale entries (files that no longer exist)
  const currentFiles = new Set(files);
  for (const [file] of indexed) {
    if (!currentFiles.has(file)) {
      removeFileFromIndex(file);
    }
  }

  const chunkCount = (database.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number }).count;
  console.log(`Memory index ready. ${files.length} files, ${chunkCount} chunks indexed.`);
}

// ── Search ──────────────────────────────────────────────────────────

export async function searchMemory(queryText: string, limit: number = 5): Promise<SearchResult[]> {
  const database = getDb();

  const allChunks = database.prepare("SELECT id, file, heading, content, embedding FROM chunks").all() as {
    id: number; file: string; heading: string; content: string; embedding: Buffer | null;
  }[];

  if (allChunks.length === 0) return [];

  // BM25 search
  const queryWords = queryText
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"`)
    .join(" OR ");

  const bm25Scores = new Map<number, number>();
  if (queryWords) {
    const ftsRows = database.prepare(
      "SELECT rowid, rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank"
    ).all(queryWords) as { rowid: number; rank: number }[];

    if (ftsRows.length > 0) {
      // rank is negative (more negative = better match); normalize to [0, 1]
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
  const scored: SearchResult[] = [];

  for (const chunk of allChunks) {
    let vectorScore = 0;
    if (hasVectors && chunk.embedding) {
      const chunkEmb = new Float64Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.byteLength / 8);
      vectorScore = Math.max(0, cosineSimilarity(queryEmbedding!, chunkEmb));
    }

    const bm25Score = bm25Scores.get(chunk.id) ?? 0;

    let score: number;
    if (hasVectors) {
      score = 0.7 * vectorScore + 0.3 * bm25Score;
    } else {
      score = bm25Score;
    }

    if (score > 0) {
      scored.push({ file: chunk.file, heading: chunk.heading, content: chunk.content, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

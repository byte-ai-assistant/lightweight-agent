import path from "path";

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "profile");

export const MEMORY_DIR    = path.join(PROFILE_DIR, "memory");
export const SKILLS_DIR    = path.join(PROFILE_DIR, "skills");
export const DATA_DIR      = path.join(PROFILE_DIR, "data");
export const PROJECTS_DIR  = path.join(PROFILE_DIR, "projects");
export const RUNTIME_DIR   = path.join(ROOT, "data"); // ephemeral: sessions, sqlite, chat-history

export const CRON_FILE     = path.join(DATA_DIR, "cron-jobs.json");
export const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
export const DB_PATH       = path.join(RUNTIME_DIR, "memory-index.sqlite");
export const SESSIONS_FILE = path.join(RUNTIME_DIR, "sessions.json");
export const HISTORY_DIR   = path.join(RUNTIME_DIR, "chat-history");
export const RESTART_MARKER = path.join(RUNTIME_DIR, ".restart-pending");

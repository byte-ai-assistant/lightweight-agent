import path from "path";

/** Project root directory (two levels up from src/lib/) */
const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Returns the directory name of the project root, e.g. "my-agent" */
export function projectName(): string {
  return path.basename(ROOT);
}

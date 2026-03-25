import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { indexFile, removeFileFromIndex } from "../memory/index.js";
import { MEMORY_DIR } from "../../paths.js";

function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

export const readMemory = tool(
  "read_memory",
  "Read a QMD memory file by name. Returns its contents. Use this to recall stored knowledge.",
  { filename: z.string().describe("Name of the .qmd file (e.g. 'preferences.qmd')") },
  async (args) => {
    ensureMemoryDir();
    const safeName = path.basename(args.filename);
    const filePath = path.join(MEMORY_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return { content: [{ type: "text" as const, text: `Memory file '${safeName}' not found.` }] };
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return { content: [{ type: "text" as const, text: content }] };
  }
);

export const writeMemory = tool(
  "write_memory",
  "Create or overwrite a QMD memory file. Use this to store important information for long-term recall.",
  {
    filename: z.string().describe("Name of the .qmd file (e.g. 'preferences.qmd')"),
    content: z.string().describe("The QMD content to write"),
  },
  async (args) => {
    ensureMemoryDir();
    const safeName = path.basename(args.filename);
    const filePath = path.join(MEMORY_DIR, safeName);

    fs.writeFileSync(filePath, args.content, "utf-8");
    if (safeName !== "base-context.qmd") await indexFile(safeName);
    return { content: [{ type: "text" as const, text: `Memory saved to '${safeName}'.` }] };
  }
);

export const updateMemory = tool(
  "update_memory",
  "Append content to an existing QMD memory file.",
  {
    filename: z.string().describe("Name of the .qmd file"),
    content: z.string().describe("Content to append"),
  },
  async (args) => {
    ensureMemoryDir();
    const safeName = path.basename(args.filename);
    const filePath = path.join(MEMORY_DIR, safeName);

    fs.appendFileSync(filePath, "\n" + args.content, "utf-8");
    if (safeName !== "base-context.qmd") await indexFile(safeName);
    return { content: [{ type: "text" as const, text: `Appended to '${safeName}'.` }] };
  }
);

export const listMemories = tool(
  "list_memories",
  "List all available QMD memory files.",
  {},
  async () => {
    ensureMemoryDir();
    const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".qmd"));

    if (files.length === 0) {
      return { content: [{ type: "text" as const, text: "No memory files found." }] };
    }

    const list = files
      .map((f) => {
        const stats = fs.statSync(path.join(MEMORY_DIR, f));
        return `- ${f} (${stats.size} bytes, modified ${stats.mtime.toISOString()})`;
      })
      .join("\n");

    return { content: [{ type: "text" as const, text: `Memory files:\n${list}` }] };
  }
);

export const deleteMemory = tool(
  "delete_memory",
  "Delete a QMD memory file.",
  { filename: z.string().describe("Name of the .qmd file to delete") },
  async (args) => {
    ensureMemoryDir();
    const safeName = path.basename(args.filename);
    const filePath = path.join(MEMORY_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return { content: [{ type: "text" as const, text: `Memory file '${safeName}' not found.` }] };
    }

    fs.unlinkSync(filePath);
    removeFileFromIndex(safeName);
    return { content: [{ type: "text" as const, text: `Deleted '${safeName}'.` }] };
  }
);

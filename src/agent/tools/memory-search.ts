import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { searchMemory } from "../memory/index.js";

export const memorySearch = tool(
  "memory_search",
  "Search memories semantically. Returns most relevant snippets for a query. Use this for deeper or more specific memory lookups.",
  {
    query: z.string().describe("The search query"),
    limit: z.number().optional().describe("Max results to return (default 5)"),
  },
  async (args) => {
    const results = await searchMemory(args.query, args.limit ?? 5);

    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: "No matching memories found." }] };
    }

    const formatted = results
      .map((r, i) => `[${i + 1}] ${r.file} > ${r.heading} (score: ${r.score.toFixed(3)})\n${r.content}`)
      .join("\n\n");

    return { content: [{ type: "text" as const, text: formatted }] };
  }
);

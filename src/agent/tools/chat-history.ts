import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { searchChatHistory, getRecentChats, ChatEntry, ChatSearchResult } from "../chat-history.js";

function formatEntry(entry: ChatEntry, userPreviewLen = 200, assistantPreviewLen = 300): string {
  const user = entry.userMessage.length > userPreviewLen
    ? entry.userMessage.slice(0, userPreviewLen) + "…"
    : entry.userMessage;
  const assistant = entry.assistantResponse.length > assistantPreviewLen
    ? entry.assistantResponse.slice(0, assistantPreviewLen) + "…"
    : entry.assistantResponse;
  return `[${entry.timestamp}] (user: ${entry.userId})\nUser: ${user}\nAssistant: ${assistant}`;
}

function formatSearchResult(entry: ChatSearchResult, userPreviewLen = 200, assistantPreviewLen = 300): string {
  return `${formatEntry(entry, userPreviewLen, assistantPreviewLen)} (score: ${entry.score.toFixed(3)})`;
}

export const searchChatHistoryTool = tool(
  "search_chat_history",
  "Search past chat exchanges across all sessions using hybrid BM25 + vector search. Use this to recall previous conversations or topics discussed with the user.",
  {
    query: z.string().describe("The search query"),
    limit: z.number().optional().describe("Max results to return (default 20)"),
  },
  async (args) => {
    const results = await searchChatHistory(args.query, args.limit ?? 20);

    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: "No matching chat history found." }] };
    }

    const formatted = results.map((r, i) => `[${i + 1}] ${formatSearchResult(r)}`).join("\n\n");
    return { content: [{ type: "text" as const, text: formatted }] };
  }
);

export const getRecentChatsTool = tool(
  "get_recent_chats",
  "Get the most recent chat exchanges across all sessions, sorted by time. Use this to review what was recently discussed.",
  {
    limit: z.number().optional().describe("Max results to return (default 20)"),
  },
  async (args) => {
    const results = getRecentChats(args.limit ?? 20);

    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: "No chat history found." }] };
    }

    const formatted = results.map((r, i) => `[${i + 1}] ${formatEntry(r)}`).join("\n\n");
    return { content: [{ type: "text" as const, text: formatted }] };
  }
);

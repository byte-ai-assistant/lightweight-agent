import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Parse AGENT_URLS env var: "sparky=http://localhost:9000,merlin=http://localhost:9003"
function getAgentUrls(): Record<string, string> {
  const raw = process.env.AGENT_URLS ?? "";
  const entries = raw
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [name, url] = pair.split("=");
      return [name.trim().toLowerCase(), url.trim()] as const;
    });
  return Object.fromEntries(entries);
}

export const delegateToAgent = tool(
  "delegate_to_agent",
  "Send a message to another agent and get their response. Use for inter-agent delegation when another agent has expertise you lack. The other agent will process the message and return a response.",
  {
    agent: z
      .string()
      .describe("Agent name (e.g. 'sparky', 'jeff', 'merlin')"),
    message: z
      .string()
      .describe(
        "The message to send. Include [Delegated] prefix and full context so the receiving agent can answer without follow-up."
      ),
  },
  async (args) => {
    const urls = getAgentUrls();
    const url = urls[args.agent.toLowerCase()];
    if (!url) {
      const available = Object.keys(urls).join(", ") || "none configured";
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown agent '${args.agent}'. Available: ${available}. Set AGENT_URLS env var.`,
          },
        ],
      };
    }

    try {
      const resp = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: args.message,
          userId: `agent:${process.env.AGENT_NAME ?? "unknown"}`,
        }),
      });

      if (!resp.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent '${args.agent}' returned HTTP ${resp.status}: ${await resp.text()}`,
            },
          ],
        };
      }

      const data = (await resp.json()) as { response?: string };
      return {
        content: [
          {
            type: "text" as const,
            text: data.response ?? JSON.stringify(data),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to reach agent '${args.agent}' at ${url}: ${err.message}`,
          },
        ],
      };
    }
  }
);

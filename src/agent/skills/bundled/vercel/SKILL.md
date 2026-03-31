---
name: vercel
description: Read and monitor Vercel projects, deployments, and logs via the Vercel MCP server
user-invocable: true
metadata:
  openclaw:
    emoji: "▲"
    category: "devops"
    requires:
      env: [VERCEL_TOKEN]
---

# Vercel

Use Vercel MCP tools to inspect and monitor Vercel projects and deployments.

## When to use
Trigger on phrases like: "check my deployment", "what's the status of X on Vercel",
"show Vercel logs", "list my Vercel projects", "did the deploy succeed", "Vercel build",
"deployment URL", "check build logs".

## Available tools (provided by the `vercel` MCP server)
- List projects and their current deployment status
- Inspect individual deployments (build logs, status, URL)
- Read runtime and build logs
- Query deployment events and errors
- Search Vercel documentation (no auth required)

## Auth
Requires a Vercel personal access token set as `VERCEL_TOKEN` in your environment.
Create one at: https://vercel.com/account/tokens

## Notes
- For better context and fewer errors, you can scope the MCP server to a specific project
  by changing the URL to `https://mcp.vercel.com/<teamSlug>/<projectSlug>` in the server config
- Prefer read and list tools for monitoring; only use write/deploy tools when explicitly asked

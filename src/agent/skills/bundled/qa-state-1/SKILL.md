---
name: qa-state-1
description: "QA state machine — STATE 1: Vercel dev deployment failing. Triage and create bug issue or escalate."
user-invocable: false
---

# STATE 1 — Vercel `dev` deployment failing

The most recent Vercel deployment for `dev` is in `error` state. Now triage and act.

## Action

1. Read the full error log from the failing deployment using the Vercel MCP server.
2. Determine the root cause category:
   - **Build error** (TypeScript, lint, compilation) → fixable by eng-agent
   - **Runtime error** (unhandled exception, missing env var, DB connection) → may need human
   - **Infrastructure error** (Vercel config, DNS, edge function limits) → escalate to human

3. For build or runtime errors fixable by eng-agent:
   ```bash
   gh issue create \
     --repo $AFFECTED_REPO \
     --title "Build failure on dev: [short description]" \
     --body "$(cat <<'EOF'
   ## Description
   The latest deployment to the `dev` branch failed.

   **Deployment URL:** [vercel deployment URL]
   **Failing commit:** [commit SHA]

   ## Error Log
   ```
   [paste relevant error lines — keep under 50 lines]
   ```

   ## Expected Behavior
   The `dev` branch should build and deploy cleanly.

   ## Actual Behavior
   Build/runtime error described above.

   ## Story Points
   **1**
   EOF
   )" \
     --label "type:bug,scope:SCOPE,status:in-development" \
     --assignee "$DEV_AGENT_HANDLE"
   ```

4. For infrastructure errors, escalate:
   ```bash
   # Post on the most recent merged PR for dev
   gh pr list --repo $REPO --state merged --base dev --json number --jq '.[0].number'
   # Then comment:
   @$CTO_HANDLE — Vercel deployment failing on dev with an infrastructure issue. Needs human attention. Error: [summary]
   ```
   Add `status:awaiting-human` to the issue.

5. Notify Telegram group if configured:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
   ```
   Example: *"dev is broken — Vercel build is failing after the latest merge. Created #N to track it. Dev agent is on it."*

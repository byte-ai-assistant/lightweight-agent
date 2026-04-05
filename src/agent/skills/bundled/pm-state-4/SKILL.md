---
name: pm-state-4
description: "PM state machine — STATE 4: Epic fully implemented. Close epic, notify team, ask for next priorities."
user-invocable: false
---

# STATE 4 — Epic fully implemented

You have detected an open `type:epic` where all story sub-issues are `status:done` (completed == total, total > 0). The dev agent has finished all work and marked the epic complete. Now close it and notify the team.

## Action

1. Gather all stories in the epic and their outcomes:
   ```bash
   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --jq '.[] | {number: .number, title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/"))}'
   ```

2. Close the epic:
   ```bash
   gh issue close $EPIC_NUM --repo $EPIC_REPO \
     --comment "Epic complete — all stories shipped to dev.

   ## Delivered
   [List each story: number, title, which repo]

   ## Business Outcome
   [What users can now do that they couldn't before]"
   ```

3. Send Telegram message to the group celebrating the delivery:

   Example tone: *"[Epic title] is done — [N] stories shipped across BE and FE. [Business outcome summary]. What should we tackle next? Reply with your priorities or say **yes** for a proposal."*

4. Check if there's more work queued:
   ```bash
   for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
     gh issue list --repo $REPO --label "status:backlog" --state open --json number --jq 'length'
     gh issue list --repo $REPO --label "type:epic" --state open --json number --jq 'length'
     gh issue list --repo $REPO --label "type:request" --state open --json number --jq 'length'
     gh issue list --repo $REPO --label "status:awaiting-human" --state open --json number --jq 'length'
   done
   ```
   - If backlog items exist → don't create awaiting-human. STATE 4 (assign from backlog) will handle it next cycle.
   - If open requests exist → don't create awaiting-human. STATE 3 (process request) will handle it next cycle.
   - If nothing is queued AND no `status:awaiting-human` exists → create a tracking issue:
   ```bash
   gh issue create --repo $BACKEND_REPO \
     --title "Awaiting new priorities" \
     --body "Pipeline clear. Reached out to team for next direction." \
     --label "type:spike,status:awaiting-human"
   ```

## Sending Telegram Messages

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in a GitHub comment.

## Communication Rules

- Telegram tone: conversational, direct. Celebrate the win.
- No technical jargon. Lead with business outcomes.
- Max 3 sentences. Ask about next priorities.

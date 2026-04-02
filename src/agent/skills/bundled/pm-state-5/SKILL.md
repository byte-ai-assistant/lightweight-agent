---
name: pm-state-5
description: "PM state machine — STATE 5: Epic completed. Close epic, notify team, ask for next priorities."
user-invocable: false
---

# STATE 5 — Epic completed

You have detected an open epic where all sub-issues are completed (100%). Now close it and notify the team.

## Action

1. Gather all stories in the epic and their outcomes:
   ```bash
   gh api repos/$REPO/issues/$EPIC_NUM/sub_issues \
     --jq '.[].number'
   ```
   For each story, get title and story points from the body.

2. Close the epic:
   ```bash
   gh issue close $EPIC_NUM --repo $REPO \
     --comment "All stories shipped. [summary of what was delivered]."
   ```

3. Send Telegram message to the group celebrating the delivery:

   Example tone: *"[Epic title] is done — [N] stories shipped. [Business outcome summary]. What should we tackle next? Reply with your priorities or say **yes** for a proposal."*

4. If no other open epics exist, create a tracking issue:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Awaiting new priorities" \
     --body "Epic completed. Reached out to team for next direction." \
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

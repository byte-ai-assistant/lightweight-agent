---
name: pm-state-7
description: "PM state machine — STATE 7: Nothing to do. Request new priorities from CEO."
user-invocable: false
---

# STATE 7 — Nothing to do

No open epics, no awaiting-human issues, no in-development work. The pipeline is clear.

## Action

1. Check recently closed epics/issues for a shipping summary.
2. Create a tracking issue **first**:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Awaiting new priorities" \
     --body "Pipeline clear. Reached out to team for next direction." \
     --label "type:spike,status:awaiting-human"
   ISSUE_URL=$(gh issue list --repo $RELEVANT_REPO \
     --label "status:awaiting-human" --state open \
     --json url --jq '.[0].url')
   ```
3. Send Telegram message to the group, **including the issue URL**:

   Example: *"Pipeline is clear — we shipped [business outcome summary]. What's next? Reply **yes** for a proposal, or drop your idea here or on [ISSUE_URL]."*

## Sending Telegram Messages

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in a GitHub comment.

## Communication Rules

- Telegram tone: conversational, direct, opinionated. Address the group.
- No technical jargon. Lead with business impact.
- Approval asks must be binary and explicit.
- Max 3 sentences.

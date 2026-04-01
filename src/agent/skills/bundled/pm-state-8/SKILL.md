---
name: pm-state-8
description: "PM state machine — STATE 8: Nothing to do. Request new priorities from CEO."
user-invocable: false
---

# STATE 8 — Nothing to do

No active sprint, no backlog stories, no epics without stories, and no open `status:awaiting-human` issues. The pipeline is clear.

## Action

1. Check recently closed issues for a shipping summary.
2. Create the tracking issue **first**:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Awaiting new priorities" \
     --body "Pipeline clear. Reached out to team for next direction." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   ISSUE_URL=$(gh issue list --repo $RELEVANT_REPO \
     --label "status:awaiting-human" --state open \
     --json url --jq '.[0].url')
   ```
3. Message the group chat conversationally (Telegram preferred), **including the issue URL** and an explicit instruction to reply:

   Example: *"Pipeline is clear — we shipped [business outcome summary]. Boards are empty. Want me to draft next priorities, or do you have something in mind? Reply **yes** for a proposal, or drop your idea here or on [ISSUE_URL]."*

## Scope Rules for Tracking Issues

- FE pipeline gap → `$FRONTEND_REPO` + `scope:frontend`
- BE pipeline gap → `$BACKEND_REPO` + `scope:backend`
- General/cross-cutting → `$FRONTEND_REPO` + `scope:both`

## Communication Rules

- Telegram tone: conversational, direct, opinionated. Address the group.
- No technical jargon. Lead with business impact.
- Approval asks must be binary and explicit.
- Max 3 sentences.

---
name: pm-state-2
description: "PM state machine — STATE 2: Human replied to blocked issue. Unblock and resume dev."
user-invocable: false
---

# STATE 2 — Human replied to escalation

You have detected an open issue with `status:awaiting-human` that has a human reply. Now act.

## Detection Details

### Channel A — GitHub reply
Check for human reply after PM escalation comment:
```bash
gh issue view ISSUE_NUM --repo REPO --json comments \
  --jq '[.comments[] | select(
    .author.login == "$CEO_HANDLE" or
    .author.login == "$CTO_HANDLE" or
    .author.login == "$EM_HANDLE" or
    (.body | test("replied via Telegram"))
  )] | sort_by(.createdAt) | last'
```

### Channel B — Telegram session context
If invoked from a Telegram message (not cron) and there is an open `status:awaiting-human` issue: check whether the incoming message provides direction. If it does, act immediately:

1. Post a relay comment on the GitHub issue **first**:
   ```bash
   gh issue comment ISSUE_NUM --repo REPO \
     --body "[Relayed from Telegram — @TELEGRAM_USERNAME]: MESSAGE_TEXT"
   ```
2. Remove `status:awaiting-human`, add appropriate next label:
   ```bash
   gh issue edit ISSUE_NUM --repo REPO \
     --remove-label "status:awaiting-human" \
     --add-label "status:in-development"
   ```

**Critical:** Never respond with "Got it, let me know when ready" when a human reply clearly resolves an issue. Act immediately.

## Action (once any channel matches)

1. Remove `status:awaiting-human`, add appropriate next status (`status:in-development` for dev blockers, or proceed with epic creation if the reply is about new priorities).
2. Post on the GitHub issue: `@$DEV_AGENT_HANDLE — Unblocked. [Summary of decision]. Resume development.` (omit if the reply was about epic direction rather than a dev blocker).
3. Confirm in the Telegram group if the downstream action didn't already send a message. One Telegram message per cron run.

## Sending Telegram Messages

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in a GitHub comment.

## Communication Rules

- Telegram tone: conversational, direct. Address the group.
- No technical jargon. Lead with business impact.
- Max 2 sentences for updates.

---
name: pm-state-2
description: "PM state machine — STATE 2: Human replied to blocked issue. Unblock and resume dev."
user-invocable: false
---

# STATE 2 — Human replied to blocked issue

You have already detected an open issue with `status:awaiting-human` that has a human reply. Now act.

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
If invoked from a Telegram message (not cron) and there is an open `status:awaiting-human` issue: check whether the incoming message provides direction. If it does, act immediately — do not defer:

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

1. Remove `status:awaiting-human`, add appropriate next status (`status:in-development` for tasks/stories, or proceed with epic/sprint creation if the reply is an alignment response).
2. Post on the GitHub issue: `@$DEV_AGENT_HANDLE — Unblocked. [Summary of decision]. Resume development.` (omit if the reply was about epic/sprint direction).
3. If `$TELEGRAM_CHAT_ID` set AND the downstream action did **not** already send a Telegram message: confirm in the group. Example: *"Got it, #12 is unblocked. Dev is back on it."* — If the downstream action already sent a Telegram, **do NOT send an additional confirmation**. One Telegram message per cron run.

## Communication Rules

- Telegram tone: conversational, direct. Address the group.
- No technical jargon. Lead with business impact.
- Max 2 sentences for updates.

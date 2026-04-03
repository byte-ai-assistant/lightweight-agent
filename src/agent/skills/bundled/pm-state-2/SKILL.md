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

Determine which type of reply this is, then follow the corresponding path:

### Path A — Dev blocker unblocked

The `status:awaiting-human` issue is a dev blocker (has `status:in-development` or references a blocked story).

1. Remove `status:awaiting-human`, add `status:in-development`.
2. Post on the GitHub issue: `@$DEV_AGENT_HANDLE — Unblocked. [Summary of decision]. Resume development.`
3. Confirm in the Telegram group if the downstream action didn't already send a message.

### Path B — New priorities provided

The `status:awaiting-human` issue is a "waiting for priorities" placeholder (e.g., "Awaiting new priorities"). The human reply provides direction on what to build next.

**Critical: Keep the `awaiting-human` issue open until all GitHub state is fully wired.** It acts as a lock — while it exists, the cron preflight skips and no other state fires. Closing it prematurely causes race conditions.

1. **Clarify scope if needed** — ask up to 2 focused questions. Do NOT create any issues until scope is confirmed. If invoked from Telegram, the user may answer immediately in the same conversation. The `awaiting-human` issue stays open during this back-and-forth.

2. **Once scope is confirmed, create the epic** — every initiative starts as an epic. Use the epic body format from pm-agent (Goal, Scope, Stories ordered, Success Criteria):
   ```bash
   EPIC_NUM=$(gh issue create \
     --repo $TARGET_REPO \
     --title "Epic: TITLE" \
     --body "EPIC BODY" \
     --label "type:epic,scope:SCOPE" \
     --json number --jq '.number')
   ```

3. **Decompose into stories and tasks** — call `load_skill('pm-state-6')` with the new epic number. This creates stories as sub-issues of the epic, tasks as sub-issues of each story, assigns the first story to `$DEV_AGENT_HANDLE` with `status:in-development`, and posts branch instructions.

4. **Add the epic to the project board.**

5. **Now close the `awaiting-human` issue** — only after everything above is complete:
   ```bash
   gh issue close $ISSUE_NUM --repo $REPO
   ```

**Critical:** Never create stories or tasks without a parent epic. The hierarchy is always Epic → Story → Task.

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

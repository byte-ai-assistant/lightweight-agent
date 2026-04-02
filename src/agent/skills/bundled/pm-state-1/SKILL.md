---
name: pm-state-1
description: "PM state machine — STATE 1: Dev is blocked. Clarify or escalate to CEO."
user-invocable: false
---

# STATE 1 — Dev is blocked

You have detected an open issue with `status:in-development` that has an unresolved blocker comment from the dev agent. Now act.

## Action

1. Read the issue body and blocker comment carefully.
2. If the blocker involves a business rule, domain concept, or product decision, run `load_skill('product-context')` to check if the answer is in the product knowledge base before escalating.
3. If resolvable from existing spec or product context → post a clarifying comment directly.
4. If requires product judgment:
   - Post GitHub comment: `@$CEO_HANDLE — Dev is blocked on #N. Details below, escalated for your input.`
   - Send Telegram message to the group chat (see below) — explain the blocker, share your take, ask a specific question. Include the issue link.

     Example tone: *"Hey — dev is stuck on the auth flow for #12. They need to know if we're doing OAuth or email/password first. I'd lean OAuth since it's what we specced, but wanted your call since it affects the timeline. What do you think? https://github.com/org/repo/issues/12"*
   - Remove `status:in-development`, add `status:awaiting-human`

## Sending Telegram Messages

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in a GitHub comment.

## Communication Rules

- Telegram tone: conversational, direct, opinionated. Address the group.
- No technical jargon (file names, component names, library names). Lead with business impact.
- Max 3 sentences for proposals. Max 2 for updates.
- Never mention internal state machine names.

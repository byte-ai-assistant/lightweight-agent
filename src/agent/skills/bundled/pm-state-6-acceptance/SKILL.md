---
name: pm-state-6-acceptance
description: "PM state machine — STATE 6: Epic/bug completed. Request user acceptance before closing."
user-invocable: false
---

# STATE 6 — Request user acceptance

You have detected either:
- An open `type:epic` where all story sub-issues are `status:done` (completed == total, total > 0) and the epic does NOT yet have `status:awaiting-acceptance`, OR
- An open `type:bug` with `status:done` and no `status:awaiting-acceptance` label

The dev work is complete and QA has merged. Now ask the reporting user to verify before closing.

## Action — Epic acceptance

1. Gather the epic body (original requirements) and delivered stories:
   ```bash
   gh issue view $EPIC_NUM --repo $EPIC_REPO --json title,body --jq '{title, body}'
   ```
   ```bash
   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --jq '.[] | {number: .number, title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/"))}'
   ```

2. Add `status:awaiting-acceptance` to the epic:
   ```bash
   gh issue edit $EPIC_NUM --repo $EPIC_REPO \
     --add-label "status:awaiting-acceptance"
   ```

3. Post a GitHub comment summarizing what was delivered vs original requirements:
   ```bash
   gh issue comment $EPIC_NUM --repo $EPIC_REPO \
     --body "$(cat <<'EOF'
   ## Acceptance Review Requested

   All stories have been implemented and merged to `dev`. Please verify the feature works as expected.

   ### What was requested
   [Summarize the Goal and Success Criteria from the epic body]

   ### What was delivered
   [List each story with number, title, and repo]

   @$CEO_HANDLE — please verify this feature works correctly. Reply with **approved** if everything looks good, or describe any issues you find.

   <!-- pm-auto -->
   EOF
   )"
   ```

4. Send Telegram message:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"[Epic title] shipped to dev. Please verify it works and reply here with *approved* or describe any issues.\", \"parse_mode\": \"Markdown\"}"
   ```

5. **Stop.** Do not close the epic. Do not assign new work.

## Action — Bug acceptance

1. Gather the bug details and linked PR:
   ```bash
   gh issue view $BUG_NUM --repo $BUG_REPO --json title,body --jq '{title, body}'
   ```

2. Remove `status:done`, add `status:awaiting-acceptance`:
   ```bash
   gh issue edit $BUG_NUM --repo $BUG_REPO \
     --remove-label "status:done" \
     --add-label "status:awaiting-acceptance"
   ```

3. Post a GitHub comment:
   ```bash
   gh issue comment $BUG_NUM --repo $BUG_REPO \
     --body "Fix merged to dev. @$CEO_HANDLE — please verify the fix works. Reply with **approved** or describe any remaining issues.

   <!-- pm-auto -->"
   ```

4. Send Telegram message:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"Bug #$BUG_NUM fixed — [title]. Please verify the fix and reply with *approved* or describe any issues.\", \"parse_mode\": \"Markdown\"}"
   ```

5. **Stop.** Do not close the bug. Do not assign new work.

## Communication Rules

- Telegram tone: conversational, direct. No technical jargon.
- Keep it to 2 sentences max. Lead with what was delivered, ask for verification.
- Always include a clear call-to-action: "reply with approved or describe any issues."
- If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in the GitHub comment.

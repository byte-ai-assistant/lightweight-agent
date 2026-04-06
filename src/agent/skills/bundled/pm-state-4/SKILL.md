---
name: pm-state-4
description: "PM state machine — STATE 7: Acceptance reply received. Close if approved, or send back to dev if issues reported."
user-invocable: false
---

# STATE 7 — Acceptance reply received

You have detected an open issue with `status:awaiting-acceptance` that has a human reply. Now determine the outcome.

## Detection Details

### Channel A — GitHub reply
Check for human reply after the acceptance request comment:
```bash
gh issue view ISSUE_NUM --repo REPO --json comments \
  --jq '[.comments[] | select(
    .author.login == "$CEO_HANDLE" or
    .author.login == "$CTO_HANDLE" or
    .author.login == "$EM_HANDLE"
  )] | sort_by(.createdAt) | last'
```

### Channel B — Telegram session context
If invoked from a Telegram message (not cron) and there is an open `status:awaiting-acceptance` issue: the incoming message is providing acceptance feedback. Act immediately:

1. Post a relay comment on the GitHub issue **first**:
   ```bash
   gh issue comment ISSUE_NUM --repo REPO \
     --body "[Relayed from Telegram — @TELEGRAM_USERNAME]: MESSAGE_TEXT"
   ```
2. Then proceed to the appropriate path below.

## Determine the outcome

Read the human reply and classify it:

### Path A — Approved

The reply is positive: "approved", "looks good", "works", "confirmed", "all good", or similar affirmative language.

1. Remove `status:awaiting-acceptance`:
   ```bash
   gh issue edit $ISSUE_NUM --repo $REPO \
     --remove-label "status:awaiting-acceptance"
   ```

2. Close the issue:
   ```bash
   gh issue close $ISSUE_NUM --repo $REPO \
     --comment "Accepted by stakeholder. Closing.

   ## Delivered
   [List each story/fix: number, title, which repo]

   ## Business Outcome
   [What users can now do that they couldn't before]"
   ```

3. Send Telegram message celebrating the delivery:
   *"[Epic/Bug title] verified and closed. [Business outcome summary]. What should we tackle next? Reply with your priorities or say **yes** for a proposal."*

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

### Path B — Issues reported

The reply describes problems: specific bugs, incorrect behavior, missing functionality, or anything that is not a clear approval.

1. Remove `status:awaiting-acceptance` and restore `status:in-development`:
   ```bash
   gh issue edit $ISSUE_NUM --repo $REPO \
     --remove-label "status:awaiting-acceptance" \
     --add-label "status:in-development"
   ```

2. Post the feedback as a structured comment tagging the dev agent:
   ```bash
   gh issue comment $ISSUE_NUM --repo $REPO \
     --body "## Acceptance Feedback — Issues Reported

   @$DEV_AGENT_HANDLE — stakeholder verification found issues. Please address all items below before this can be re-submitted for acceptance.

   ### Reported Issues
   [Quote or summarize the human's feedback — preserve all specific details, error messages, and reproduction steps]

   Once all issues are resolved and merged, this will be re-submitted for acceptance automatically."
   ```

3. Send Telegram confirmation:
   *"Got it — sending [Epic/Bug title] back to dev with your feedback. Will re-request acceptance once fixes are shipped."*

4. **Stop.** Do not close. Do not assign new work. The dev agent will detect the `status:in-development` label on the next cycle and address the feedback. Once all fixes are merged, STATE 6 will fire again requesting acceptance.

## Sending Telegram Messages

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging stakeholders in a GitHub comment.

## Communication Rules

- Telegram tone: conversational, direct.
- Path A: Celebrate the win. No technical jargon. Lead with business outcomes. Max 3 sentences.
- Path B: Acknowledge the feedback, confirm it's going back to dev. Reassuring tone — no blame. Max 2 sentences.

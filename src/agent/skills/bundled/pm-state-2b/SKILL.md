---
name: pm-state-2b
description: "PM state machine — STATE 2b: Process incoming feature request or bug report. Convert to epic or triage bug into backlog."
user-invocable: false
---

# STATE 2b — Process incoming request or bug

You have detected either a `type:request` issue (feature request from Telegram) or a `type:bug` issue with no status label (bug report from Telegram). Process it into the proper pipeline.

## Action — Feature Request (`type:request`)

1. Read the request body:
   ```bash
   gh issue view $REQUEST_NUM --repo $REPO --json body,title,labels
   ```

2. Load `product-context` to understand the product roadmap, domain, and what exists.

3. Determine scope:
   - `scope:both` → create epic in `$BACKEND_REPO`
   - `scope:backend` → create epic in `$BACKEND_REPO`
   - `scope:frontend` → create epic in `$FRONTEND_REPO`

4. Create the epic with `status:backlog`:
   ```bash
   EPIC_NUM=$(gh issue create \
     --repo $TARGET_REPO \
     --title "Epic: TITLE" \
     --body "$(cat <<'EOF'
   ## Goal
   [Derived from the request — what this achieves for users and the business]

   ## Scope
   **In scope:** [explicit list]
   **Out of scope:** [explicit list]

   ## Backend Requirements
   - [API endpoints, schema changes, business logic]

   ## Frontend Requirements
   - [UI pages/components, user flows, integration points]

   ## Success Criteria
   - [ ] [Measurable, user-visible outcome]

   ## Source
   Created from request #REQUEST_NUM
   EOF
   )" \
     --label "type:epic,scope:SCOPE,status:backlog" \
     --json number --jq '.number')
   ```

5. Close the request issue:
   ```bash
   gh issue close $REQUEST_NUM --repo $REPO \
     --comment "Converted to Epic #$EPIC_NUM in $TARGET_REPO."
   ```

6. Send Telegram notification:
   *"Created Epic #N — [title]. It's in the backlog. [If nothing else is in-development: Dev will pick it up next cycle. / If something is active: Will be assigned after the current epic completes.]"*

## Action — Bug Report (`type:bug` with no status label)

1. Read the bug body:
   ```bash
   gh issue view $BUG_NUM --repo $REPO --json body,title,labels,assignees
   ```

2. Add `status:backlog` and assign to dev:
   ```bash
   gh issue edit $BUG_NUM --repo $REPO \
     --add-label "status:backlog" \
     --assignee "$DEV_AGENT_HANDLE"
   ```

3. The next evaluation of STATE 3 (assign from backlog) will determine when to assign this based on PM judgment and current workload.

## Notes

- Process only ONE item per cron run (first match).
- If both a request and a bug exist, process the request first (it's likely from a more recent CEO interaction).
- Do NOT assign `status:in-development` here. STATE 3 handles assignment from backlog.
- The epic body should be well-formed even though the request might be informal. Translate CEO language into structured requirements.

---
name: pm-state-6
description: "PM state machine — STATE 6: Epic needs decomposition. Create missing stories + tasks idempotently."
user-invocable: false
---

# STATE 6 — Epic needs decomposition (recovery)

You have detected an open epic that either has zero sub-issues or has fewer sub-issues than the stories listed in its body. This is a recovery state — the epic was created (interactively or manually) but decomposition was interrupted or incomplete.

## Action

1. Read the epic body. Find the "Stories (ordered)" section to get the planned story list.
2. List existing sub-issues of the epic:
   ```bash
   gh api repos/$REPO/issues/$EPIC_NUM/sub_issues --jq '.[].number'
   ```
3. For each existing sub-issue, get its title to match against the plan.
4. **Create only the missing stories and their tasks.** For each missing story:

   a. Create the story:
   ```bash
   STORY_NUM=$(gh issue create \
     --repo $TARGET_REPO \
     --title "STORY TITLE" \
     --body "STORY BODY (using story template)" \
     --label "type:story,scope:SCOPE" \
     --json number --jq '.number')

   STORY_DB_ID=$(gh api repos/$TARGET_REPO/issues/$STORY_NUM --jq '.id')

   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --method POST --field sub_issue_id=$STORY_DB_ID
   ```

   b. Create 2-5 tasks for the story:
   ```bash
   TASK_NUM=$(gh issue create \
     --repo $TARGET_REPO \
     --title "TASK TITLE" \
     --body "TASK BODY" \
     --label "type:task,scope:SCOPE,status:in-development" \
     --json number --jq '.number')

   TASK_DB_ID=$(gh api repos/$TARGET_REPO/issues/$TASK_NUM --jq '.id')

   gh api repos/$TARGET_REPO/issues/$STORY_NUM/sub_issues \
     --method POST --field sub_issue_id=$TASK_DB_ID
   ```

5. After all stories and tasks are created, assign the **first unstarted story** (lowest issue number) to `$DEV_AGENT_HANDLE` with `status:in-development`:
   ```bash
   gh issue edit $STORY_NUM --repo $REPO \
     --assignee "$DEV_AGENT_HANDLE" \
     --add-label "status:in-development"
   ```

6. Post on the assigned story with branch instructions:
   ```
   @$DEV_AGENT_HANDLE — this story is ready. Please implement:

   - Branch: `story/[STORY_NUM]-[short-slug]`
   - Work through all tasks on this single branch.
   - When all tasks are done, open **one PR** against `dev` with `Closes #[STORY_NUM]` in the body.
   ```

## Scope Rules

- FE stories (UI, components, pages, client logic) → `$FRONTEND_REPO` with `scope:frontend`
- BE stories (API, data models, business logic, infra) → `$BACKEND_REPO` with `scope:backend`
- Never create a story with `scope:both` — split into FE and BE stories

## Story Template

```markdown
## User Story
As a **[role]**, I want **[feature]** so that **[benefit]**.

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

## Story Points
**[1 / 2 / 3 / 5 / 8]** — [brief rationale]

## Branch & PR
- Branch: `story/[STORY-NUMBER]-[short-slug]`
- One PR per story against `dev`. PR body must include `Closes #[story-number]`.

## Epic
[Link to parent epic issue]

## Tasks
[Will be added as sub-issues]
```

## Task Template

```markdown
## What
[Clear technical description]

## Estimated Hours
**[1h / 2h / 4h / 8h]**

## Story
[Link to parent story]

## Acceptance Criteria
- [ ] [Specific, testable condition]
- [ ] [Specific, testable condition]
```

## Sub-Issue Wiring

`sub_issue_id` requires the GitHub **database ID**, not the issue number:
```bash
ISSUE_DB_ID=$(gh api repos/$REPO/issues/$ISSUE_NUM --jq '.id')
```

Cross-repo note: use the parent's repo in the API path:
```bash
gh api repos/$PARENT_REPO/issues/$PARENT_NUM/sub_issues \
  --method POST --field sub_issue_id=$CHILD_DB_ID
```

## Idempotency

This state can run multiple times safely. It only creates stories/tasks that don't already exist under the epic. Match existing sub-issues by title against the plan in the epic body.

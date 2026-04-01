---
name: pm-state-4
description: "PM state machine — STATE 4: Story in sprint has no tasks. Decompose into tasks."
user-invocable: false
---

# STATE 4 — Story in sprint has no tasks (task decomposition)

You have already detected an open `type:story` with `status:in-sprint` and zero sub-issues. Now decompose it.

## Action

1. Read the story body, acceptance criteria, and parent epic context carefully.
2. Break down into 2–5 concrete tasks. Each task = one independently implementable unit (≤8h).
3. For each task, create it and immediately wire it as a sub-issue of the story:
   ```bash
   TASK_NUM=$(gh issue create \
     --repo $REPO \
     --title "TASK TITLE" \
     --body "TASK BODY (using task template below)" \
     --label "type:task,scope:SCOPE,status:in-development" \
     --milestone "Sprint N — ..." \
     --json number --jq '.number')

   TASK_DB_ID=$(gh api repos/$REPO/issues/$TASK_NUM --jq '.id')

   gh api repos/$REPO/issues/$STORY_NUM/sub_issues \
     --method POST --field sub_issue_id=$TASK_DB_ID
   ```
4. Update the story body to append a task checklist:
   ```bash
   CURRENT_BODY=$(gh api repos/$REPO/issues/$STORY_NUM --jq '.body')
   TASK_LIST="## Tasks\n- [ ] #TASK1_NUM — TASK1_TITLE\n- [ ] #TASK2_NUM — TASK2_TITLE\n..."
   gh api repos/$REPO/issues/$STORY_NUM \
     --method PATCH \
     --field body="$CURRENT_BODY\n\n$TASK_LIST"
   ```
5. Assign the story to `$DEV_AGENT_HANDLE` and transition labels:
   ```bash
   gh issue edit $STORY_NUM --repo $REPO \
     --assignee "$DEV_AGENT_HANDLE" \
     --remove-label "status:in-sprint" \
     --add-label "status:in-development"
   ```
6. Post on story:
   ```
   Tasks created, linked as sub-issues, and listed above. @$DEV_AGENT_HANDLE — please implement this story:

   - Branch: `story/[STORY_NUM]-[short-slug]`
   - Work through all tasks on this single branch. Do not open separate PRs for individual tasks.
   - Check off each task issue as you complete it.
   - When all tasks are done, open **one PR** against `dev` with `Closes #[STORY_NUM]` in the body.
   ```

## Task Template

```markdown
## What
[Clear technical description of what needs to be implemented]

## Estimated Hours
**[1h / 2h / 4h / 8h]**

## Story
[Link to parent story issue]

## Acceptance Criteria
- [ ] [Specific, testable technical condition]
- [ ] [Specific, testable technical condition]

## Notes
[Implementation approach, gotchas, relevant file paths or endpoints]
```

## Sub-Issue Wiring

`sub_issue_id` requires the GitHub **database ID** (integer), not the issue number. Always capture it:
```bash
ISSUE_DB_ID=$(gh api repos/$REPO/issues/$ISSUE_NUM --jq '.id')
```

## Quality Rules

- Tasks: completable in ≤8 hours. If larger, split further.
- Every task needs: what to build, hour estimate, and 2+ acceptance criteria.
- Hour estimates: 1h (under an hour), 2h (half day), 4h (most of a day), 8h (full day — consider splitting).

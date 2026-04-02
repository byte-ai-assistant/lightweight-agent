---
name: pm-state-4
description: "PM state machine — STATE 4: Story completed, assign next story from epic to dev."
user-invocable: false
---

# STATE 4 — Story completed, assign next

You have detected an open epic with at least one completed story and at least one unstarted story, with no story currently in development. Now assign the next story.

## Action

1. List all story sub-issues of the epic and their current status labels.
2. Identify the **lowest-numbered unstarted story** (creation order = priority order).
   - "Unstarted" = does NOT have any of: `status:in-development`, `status:ready-for-review`, `status:in-review`, `status:changes-requested`, `status:done`
3. Assign the story to `$DEV_AGENT_HANDLE` and label `status:in-development`:
   ```bash
   gh issue edit $STORY_NUM --repo $REPO \
     --assignee "$DEV_AGENT_HANDLE" \
     --add-label "status:in-development"
   ```
4. Post instructions on the story:
   ```
   @$DEV_AGENT_HANDLE — this story is ready. Please implement:

   - Branch: `story/[STORY_NUM]-[short-slug]`
   - Work through all tasks on this single branch. Do not open separate PRs for individual tasks.
   - Check off each task issue as you complete it.
   - When all tasks are done, open **one PR** against `dev` with `Closes #[STORY_NUM]` in the body.
   ```

## Notes

- Stories are always assigned one at a time, in issue number order (which matches creation order from the epic plan).
- The dev agent works on one story at a time — never assign multiple stories simultaneously.
- If the story has no task sub-issues, the dev agent will implement the story directly based on its acceptance criteria.

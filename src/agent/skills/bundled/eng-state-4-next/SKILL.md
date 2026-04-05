---
name: eng-state-4-next
description: "Eng state machine — STATE 4: Story done, pick up next unstarted story from the epic."
user-invocable: false
---

# STATE 4 — Story done, pick up next from epic

You have an open `type:epic` assigned to you with at least one completed story, at least one unstarted story, and no story currently `status:in-development`. Now assign the next story to yourself.

## Action

1. Find the epic assigned to you:
   ```bash
   for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
     gh issue list --repo $REPO \
       --assignee $MY_HANDLE \
       --label "type:epic,status:in-development" --state open \
       --json number,title,url
   done
   ```

2. List all story sub-issues of the epic and their current status:
   ```bash
   for sub_num in $(gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues --jq '.[].number'); do
     # Sub-issues may be in a different repo (cross-repo sub-issues)
     # The sub_issues endpoint returns full issue URLs — extract repo and number
     gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
       --jq '.[] | {number: .number, title: .title, state: .state, labels: [.labels[].name], repo: (.repository_url | split("/") | .[-2:] | join("/"))}'
   done
   ```

3. Identify the **lowest-numbered unstarted story** (creation order = priority order).
   - "Unstarted" = does NOT have any of: `status:in-development`, `status:ready-for-review`, `status:in-review`, `status:changes-requested`, `status:done`
   - Only consider `type:story` issues, not `type:task`

4. Assign the story to yourself and label `status:in-development`:
   ```bash
   gh issue edit $STORY_NUM --repo $STORY_REPO \
     --assignee "$MY_HANDLE" \
     --add-label "status:in-development"
   ```

5. Post on the story:
   ```
   Picking up this story as part of Epic #$EPIC_NUM. Branch: `story/$STORY_NUM-[short-slug]` → PR against `dev`.
   ```

## Notes

- Stories are always picked up in issue number order (which matches creation order from the implementation plan).
- One story at a time — never assign multiple stories simultaneously.
- If the next story is in a different repo than the current one (e.g., switching from BE to FE), that is normal for `scope:both` epics.
- If no unstarted stories remain, this state should not have matched — check STATE 5 (all stories done) instead.

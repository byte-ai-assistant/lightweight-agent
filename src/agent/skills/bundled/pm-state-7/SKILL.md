---
name: pm-state-7
description: "PM state machine — STATE 7: Epic needs stories. Decompose epic into user stories."
user-invocable: false
---

# STATE 7 — Epic needs stories

You have already detected an open `type:epic` with zero sub-issues and no `status:awaiting-human`. Now decompose it.

## Action

1. Read the epic goal, scope, and success criteria carefully.
2. Break it down into 3–6 user stories. Each must:
   - Fit in one sprint (≤8 story points)
   - Have a clear user-facing benefit
   - Have 3+ testable acceptance criteria
3. **Determine the target repo for each story based on its scope:**
   - FE stories (UI, components, pages, client logic) → `$FRONTEND_REPO` with `scope:frontend`
   - BE stories (API, data models, business logic, infra) → `$BACKEND_REPO` with `scope:backend`
   - If the epic is `scope:both`, split stories across both repos. Never create a story with `scope:both`.
4. Create each story in the correct repo and immediately wire it as a sub-issue of the epic:
   ```bash
   STORY_NUM=$(gh issue create \
     --repo $TARGET_REPO \
     --title "As a [role], I want [feature]" \
     --body "STORY BODY (using story template below)" \
     --label "type:story,scope:SCOPE,status:backlog" \
     --json number --jq '.number')

   STORY_DB_ID=$(gh api repos/$TARGET_REPO/issues/$STORY_NUM --jq '.id')

   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --method POST --field sub_issue_id=$STORY_DB_ID
   ```
5. Post on epic: `[N] stories created and added to backlog ([X] FE in $FRONTEND_REPO, [Y] BE in $BACKEND_REPO).`

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
- Branch: `story/[STORY-NUMBER]-[short-slug]` — use the story's own issue number
- One PR per story against `dev`. PR body must include `Closes #[story-number]`.
- Tasks are internal checklist items — no separate PRs.

## Epic
[Link to parent epic issue]

## Tasks
[Will be added as sub-issues during sprint planning]

## Notes
[Edge cases, design constraints, API contracts if relevant]
```

## Sub-Issue Wiring

`sub_issue_id` requires the GitHub **database ID**, not the issue number:
```bash
ISSUE_DB_ID=$(gh api repos/$REPO/issues/$ISSUE_NUM --jq '.id')
```

**Cross-repo note:** Stories may live in a different repo than their epic. The sub-issues API requires the same org but allows different repos — use the epic's repo in the API path:
```bash
gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
  --method POST --field sub_issue_id=$STORY_DB_ID
```

## Quality Rules

- Stories: fit in one sprint (≤8 points). If larger, split into multiple stories.
- Every story needs: user role, desired action, benefit, and 3+ acceptance criteria.
- Story points: 1 (trivial) / 2 (small) / 3 (medium) / 5 (large) / 8 (very large — consider splitting).

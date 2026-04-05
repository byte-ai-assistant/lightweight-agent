---
name: eng-state-2-plan
description: "Eng state machine — STATE 2: Assigned epic with no implementation plan. Plan the feature, decompose into stories and tasks, assign first story."
user-invocable: false
---

# STATE 2 — Plan the epic

You have an open `type:epic` with `status:in-development` assigned to you, and you haven't posted an implementation plan yet. Now plan the feature, decompose it into stories and tasks, and start working.

## Action

### Step 1 — Understand the requirements

Read the epic body:
```bash
gh issue view $EPIC_NUM --repo $EPIC_REPO --json body,title,labels \
  --jq '{title: .title, body: .body, labels: [.labels[].name]}'
```

Identify the scope label: `scope:both`, `scope:backend`, or `scope:frontend`.

### Step 2 — Load repo context

Load the architecture knowledge bases to understand the current codebase:

- `load_skill('be-repo-context')` — always load for `scope:both` and `scope:backend` epics
- `load_skill('fe-repo-context')` — always load for `scope:both` and `scope:frontend` epics

Use the repo context to understand: existing schema, API modules, UI pages, patterns, conventions, and how to extend the system for the new feature.

**If the requirements are ambiguous or technically infeasible** based on what you know from the repo context, **stop here** and post a blocker comment on the epic:
```bash
gh issue comment $EPIC_NUM --repo $EPIC_REPO \
  --body "blocked: [specific question about requirements or technical concern]"
```
Then stop. Do not create a plan or any issues. The PM agent will detect the blocker and clarify.

### Step 3 — Post the implementation plan

Post the plan as a comment on the epic. This makes it visible to the PM, QA, and humans.

```bash
gh issue comment $EPIC_NUM --repo $EPIC_REPO \
  --body "$(cat <<'EOF'
## Implementation Plan

### Analysis
[What exists today in the codebase that's relevant. What needs to change. Key technical decisions.]

### Stories (ordered)
1. **[BE] Story title** — brief description (repo: sparkiq-gh/sparkiq-erp-be)
2. **[BE] Story title** — brief description (repo: sparkiq-gh/sparkiq-erp-be)
3. **[FE] Story title** — brief description (repo: sparkiq-gh/sparkiq-erp-fe)
4. **[FE] Story title** — brief description (repo: sparkiq-gh/sparkiq-erp-fe)

### Risks / Open Questions
[Anything that might cause a blocker]

### Estimated Total
[N] stories, [M] story points
EOF
)"
```

**Story ordering rules:**
- BE stories before FE stories (API contract drives the UI)
- Schema/model changes before business logic
- Business logic before UI integration
- Each story should be independently mergeable to `dev`

### Step 4 — Create story issues

For each story in the plan, create an issue in the appropriate repo:

```bash
STORY_NUM=$(gh issue create \
  --repo $TARGET_REPO \
  --title "STORY TITLE" \
  --body "$(cat <<'EOF'
## User Story
As a **[role]**, I want **[feature]** so that **[benefit]**.

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

## Story Points
**[1 / 2 / 3 / 5 / 8]** — [brief rationale]

## Branch & PR
- Branch: `story/[STORY-NUMBER]-[short-slug]`
- One PR against `dev`. PR body must include `Closes #[story-number]`.

## Epic
Part of Epic #$EPIC_NUM
EOF
)" \
  --label "type:story,scope:SCOPE" \
  --assignee "$MY_HANDLE" \
  --json number --jq '.number')
```

**Wire as sub-issue of the epic:**
```bash
STORY_DB_ID=$(gh api repos/$TARGET_REPO/issues/$STORY_NUM --jq '.id')
gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
  --method POST --field sub_issue_id=$STORY_DB_ID
```

**Cross-repo note:** If the story is in a different repo than the epic (e.g., FE story under a BE epic), use the epic's repo in the API path — the `sub_issue_id` is the child's database ID regardless of repo.

### Step 5 — Create task issues

For each story, create 2-5 task issues as sub-issues:

```bash
TASK_NUM=$(gh issue create \
  --repo $TARGET_REPO \
  --title "TASK TITLE" \
  --body "$(cat <<'EOF'
## What
[Clear technical description]

## Estimated Hours
**[1h / 2h / 4h / 8h]**

## Story
Part of Story #$STORY_NUM

## Acceptance Criteria
- [ ] [Specific, testable condition]
EOF
)" \
  --label "type:task,scope:SCOPE" \
  --json number --jq '.number')

TASK_DB_ID=$(gh api repos/$TARGET_REPO/issues/$TASK_NUM --jq '.id')
gh api repos/$TARGET_REPO/issues/$STORY_NUM/sub_issues \
  --method POST --field sub_issue_id=$TASK_DB_ID
```

### Step 6 — Assign the first story

Assign the lowest-numbered story to yourself with `status:in-development`:

```bash
gh issue edit $FIRST_STORY_NUM --repo $FIRST_STORY_REPO \
  --add-label "status:in-development"
```

Post on the story:
```
Starting implementation. Branch: `story/$FIRST_STORY_NUM-[short-slug]` → PR against `dev`.
```

## Idempotency

This skill may run multiple times if interrupted. Before creating anything:

1. **Check for existing plan comment** — search your own comments for "## Implementation Plan". If found, skip to Step 4.
2. **Check for existing sub-issues** — `gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues`. Match existing stories by title against the plan. Only create stories that don't already exist.
3. **Check for existing tasks** — for each story, check its sub-issues before creating tasks.

## Sub-Issue Wiring

`sub_issue_id` requires the GitHub **database ID**, not the issue number:
```bash
ISSUE_DB_ID=$(gh api repos/$REPO/issues/$ISSUE_NUM --jq '.id')
```

## Design Principles (non-negotiable)

- **Documents ≠ Journals**: Documents = mutable business intent. Journals = immutable accounting truth.
- **GL is immutable**: No destructive edits. Changes = reversal + new entry only.
- **API-first**: FE and external tools consume the same API.
- **Multi-tenancy from day one**: No single-tenant shortcuts. All queries org-scoped.
- **Audit trails always**: Financial data mutations must be traceable.
- **Boring technology bias**: Default to the existing stack. No new dependencies without justification.

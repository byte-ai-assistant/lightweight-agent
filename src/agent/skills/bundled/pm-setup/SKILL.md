---
name: pm-setup
description: "PM agent setup — label creation script, issue templates, and scope rules for initial repo configuration."
user-invocable: false
---

# PM Setup — Labels, Templates, and Reference

This skill contains one-time setup material and reference templates used by the PM agent when creating issues.

---

## Label System

Ensure all labels exist in both repos. Create any that are missing:

```bash
REPOS=("$FRONTEND_REPO" "$BACKEND_REPO")
for REPO in "${REPOS[@]}"; do
  # Type
  gh label create "type:epic"  --repo $REPO --color 8b5cf6 --force
  gh label create "type:story" --repo $REPO --color 0075ca --force
  gh label create "type:task"  --repo $REPO --color bfd4f2 --force
  gh label create "type:bug"   --repo $REPO --color d73a4a --force
  gh label create "type:spike" --repo $REPO --color e4e669 --force
  # Scope
  gh label create "scope:frontend" --repo $REPO --color c5def5 --force
  gh label create "scope:backend"  --repo $REPO --color c5def5 --force
  gh label create "scope:both"     --repo $REPO --color c5def5 --force
  # Status
  gh label create "status:backlog"            --repo $REPO --color ededed --force
  gh label create "status:in-sprint"          --repo $REPO --color fbca04 --force
  gh label create "status:in-development"     --repo $REPO --color f9d71c --force
  gh label create "status:ready-for-review"   --repo $REPO --color 0e8a16 --force
  gh label create "status:in-review"          --repo $REPO --color 1d76db --force
  gh label create "status:changes-requested"  --repo $REPO --color e11d48 --force
  gh label create "status:awaiting-human"     --repo $REPO --color 8b5cf6 --force
  gh label create "status:done"               --repo $REPO --color 6f42c1 --force
done
```

### Label Definitions

**Type:** `type:epic` (large initiative) · `type:story` (user-facing feature) · `type:task` (technical work item) · `type:bug` (defect) · `type:spike` (research)

**Scope:** `scope:frontend` (FE repo only) · `scope:backend` (BE repo only) · `scope:both` (epics only — signals stories in both repos)

**Status (PM owns transitions marked ✏️):**
- `status:backlog` — groomed, not in sprint
- `status:in-sprint` ✏️ — in active sprint, awaiting task decomposition
- `status:in-development` ✏️ — dev agent actively working
- `status:ready-for-review` — PR submitted
- `status:in-review` — review in progress
- `status:changes-requested` — reviewer requested changes
- `status:awaiting-human` ✏️ — blocked on human input
- `status:done` — set by QA agent after merge

---

## Issue Templates

### Epic
```markdown
## Goal
[What this epic achieves for users and the business]

## Scope
**In scope:** [explicit list]
**Out of scope:** [explicit list]

## Success Criteria
- [ ] [Measurable, user-visible outcome]
- [ ] [Measurable, user-visible outcome]

## Stories
[Linked as sub-issues — do not fill in manually]

## Notes
[Strategic context, dependencies, risks]
```

### User Story
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
[Will be added as sub-issues during sprint planning]

## Notes
[Edge cases, design constraints, API contracts if relevant]
```

### Task
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

### Bug
```markdown
## Description
[What's broken and how to reproduce it]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Story Points
**[1 / 2 / 3 / 5]**

## Steps to Reproduce
1. [Step]
2. [Step]

## Notes
[Suspected cause, relevant logs or error messages]
```

---

## Issue Quality Rules

- Tasks: completable in ≤8 hours. If larger, split further.
- Stories: fit in one sprint (≤8 points). If larger, split into multiple stories.
- Epics: no size limit, but must have explicit scope boundaries.
- Every story needs: user role, desired action, benefit, and 3+ acceptance criteria.
- Every task needs: what to build, hour estimate, and 2+ acceptance criteria.
- Never create a vague issue. If you can't write acceptance criteria, escalate first.

**Story point scale:** 1 (trivial) · 2 (small) · 3 (medium) · 5 (large) · 8 (very large — consider splitting)

**Hour estimate scale:** 1h (under an hour) · 2h (half day) · 4h (most of a day) · 8h (full day — consider splitting)

---

## Scope Rules

- `scope:frontend` → issue in `$FRONTEND_REPO` only
- `scope:backend` → issue in `$BACKEND_REPO` only
- `scope:both` → **epics only** — never on stories or tasks
- For `scope:both` epics: decompose into separate FE and BE stories in their respective repos
- Process/meta issues: create in the repo matching the primary scope of the work being tracked

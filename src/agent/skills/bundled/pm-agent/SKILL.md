---
name: pm-agent
description: >
  Agentic Scrum PM that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Manages the full Epic → Story → Task hierarchy, sprint milestones, sprint planning, sprint review,
  blocker resolution, and CEO alignment. One action per run.
user-invocable: true
metadata:
  openclaw:
    category: "project-management"
    requires:
      bins:
        - gh
        - jq
      env:
        - GITHUB_TOKEN
---

# PM Agent — Scrum State Machine (Dispatcher)

Each cron run: scan GitHub across both repos, evaluate states top-to-bottom, execute the **first matching state only**, then stop. Never handle more than one state per run.

---

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Source |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → FE repo (e.g. `org/repo-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → BE repo (e.g. `org/repo-be`) |
| `$ORG` | `projects.qmd` → GitHub org |
| `$FE_PROJECT_NUM` | `projects.qmd` → FE project board number |
| `$BE_PROJECT_NUM` | `projects.qmd` → BE project board number |
| `$CEO_HANDLE` | `people.qmd` → CEO GitHub handle |
| `$CTO_HANDLE` | `people.qmd` → CTO GitHub handle |
| `$EM_HANDLE` | `people.qmd` → Engineering Manager GitHub handle |
| `$DEV_AGENT_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent handle (optional) |
| `$TELEGRAM_CHAT_ID` | `people.qmd` → Telegram group chat ID for stakeholder alignment (optional) |
| `$CEO_TELEGRAM` | `people.qmd` → CEO Telegram username, e.g. `farriaga` (optional) |
| `$CTO_TELEGRAM` | `people.qmd` → CTO Telegram username (optional) |
| `$EM_TELEGRAM` | `people.qmd` → EM Telegram username (optional) |

If any required variable is missing, stop and report which fields need to be set.
`$REVIEW_AGENT_HANDLE`, `$TELEGRAM_CHAT_ID`, and the `$*_TELEGRAM` handle variables are optional.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/10 * * * *", "PM agent loop", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

Also ensure all labels exist in both repos before first run — run `load_skill('pm-setup')` for the label creation script and issue templates.

---

## Hierarchy Model

```
Epic (type:epic)
  └── Story (type:story)  ← ONE branch, ONE PR, one sprint
        └── Task (type:task)  ← internal dev checklist item, NOT a separate PR
```

- **Epic** — Large initiative spanning multiple sprints. Never assigned to a sprint milestone directly.
- **Story** — The unit of deployment. One feature branch, one PR, one merge to `dev`. Estimated in story points (1/2/3/5/8).
- **Task** — Internal checklist item under a story. Tracked as a sub-issue but **never gets its own branch or PR**.
- **Bug** — `type:bug` — story-level defect fix. One branch, one PR.
- **Spike** — `type:spike` — time-boxed research. Treated like a task.

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill for detailed action instructions.

### STATE 1 — Dev is blocked *(highest priority)*

**Condition:** Open `type:task` or `type:story` with `status:in-development` has an unresolved "blocked" or "unclear" comment from `$DEV_AGENT_HANDLE`, and PM has not already responded after that comment.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,comments
done
```
Filter for dev agent comments containing "blocked" or "unclear". Check if PM already replied after that comment — if yes, skip.

**If matched → `load_skill('pm-state-1')`**

---

### STATE 2 — Human replied to blocked issue

**Condition:** Open issue with `status:awaiting-human` has a reply from a human stakeholder — via GitHub OR Telegram group.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:awaiting-human" --state open \
    --json number,title,url,comments
done
```
For each issue: find PM escalation comment timestamp. Check for human reply after it (from `$CEO_HANDLE`, `$CTO_HANDLE`, or `$EM_HANDLE`).

Also check: if this skill was invoked from a Telegram message (not cron) and there is an open `status:awaiting-human` issue, the incoming message may be providing direction.

**If matched → `load_skill('pm-state-2')`**

---

### STATE 3 — Dev is stale

**Condition:** Open `type:story` or `type:bug` with `status:in-development`, no activity for >60 minutes, and last PM comment is not already an unanswered status-check ping.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,updatedAt,comments,labels \
    --jq '[.[] | select(.labels[].name | test("type:story|type:bug"))]'
done
```
Check `updatedAt > 60 min ago`. Check last comment is not an unanswered PM ping.

**If matched → action is simple, no sub-skill needed:**
```
Post: "Status check — @$DEV_AGENT_HANDLE please update on progress or flag blockers."
```

---

### STATE 4 — Story in sprint has no tasks

**Condition:** Open `type:story` with `status:in-sprint` has no sub-issues (tasks not yet created).

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:story,status:in-sprint" --state open \
    --json number,title,url,body
done
```
For each story, check sub-issue count:
```bash
gh api repos/$REPO/issues/$ISSUE_NUM --jq '.sub_issues_summary.total'
```
If total == 0 → act.

**If matched → `load_skill('pm-state-4')`**

---

### STATE 4b — Sprint completed early

**Condition:** An active sprint milestone exists, its `due_on` is still in the future, BUT the milestone has zero open issues across both repos (all work shipped ahead of schedule).

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh api repos/$REPO/milestones \
    --jq '[.[] | select(.state == "open")] | sort_by(.due_on) | first | {number, title, due_on, open_issues}'
done
```
Check if `due_on > today` AND `open_issues == 0` in both repos.

**If matched → `load_skill('pm-state-5')`** (same sprint review action — the sub-skill handles both early and on-time completion)

---

### STATE 5 — Sprint review needed (milestone due)

**Condition:** An active sprint milestone exists and its `due_on` date is today or in the past.

```bash
gh api repos/$FRONTEND_REPO/milestones \
  --jq '[.[] | select(.state == "open")] | sort_by(.due_on) | first'
```
Check if `due_on <= today`.

**If matched → `load_skill('pm-state-5')`**

---

### STATE 6 — Sprint planning needed

**Condition:** No active sprint milestone AND backlog has at least one `type:story` with `status:backlog` AND no open `status:awaiting-human` issue with "planning" in the title.

```bash
# No active sprint
gh api repos/$FRONTEND_REPO/milestones \
  --jq '[.[] | select(.state == "open")] | length'
# Should be 0

# Backlog stories exist
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:story,status:backlog" --state open \
    --json number,title,body
done
```

**If matched → `load_skill('pm-state-6')`**

---

### STATE 7 — Epic needs stories

**Condition:** Open `type:epic` issue exists with zero sub-issues, and no `status:awaiting-human` already on it.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url,body,labels
done
```
For each epic, check sub-issue count:
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '.sub_issues_summary.total'
```
If total == 0 and no `status:awaiting-human` label → act.

**If matched → `load_skill('pm-state-7')`**

---

### STATE 8 — Nothing to do *(lowest priority)*

**Condition:** No active sprint, no backlog stories, no epics without stories, and **no open `status:awaiting-human` issues** (of any kind).

**If matched → `load_skill('pm-state-8')`**

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **One Telegram message per cron run.** If the downstream action already sends a Telegram message, don't send another.
- **Never merge PRs.** Merging is the QA agent's responsibility.
- **Never create vague issues.** Can't write acceptance criteria? Escalate first.
- **Don't double-ping.** Check STATE 1 and STATE 3 for existing unanswered PM comments before acting.
- **Always wire sub-issues immediately after creation.** No orphan issues.
- **sub_issue_id is always the database ID, never the issue number.** Use `gh api repos/$REPO/issues/$NUM --jq '.id'` to get it.
- **One PR per story. Tasks never get their own PR.**
- **Branch naming:** `story/[STORY-NUMBER]-[short-slug]` for stories, `bug/[BUG-NUMBER]-[short-slug]` for bugs.
- **PR must close the story:** PR body must include `Closes #[story-number]`.
- **GitHub is source of truth for dev. Telegram is for CEO alignment.**
- **Sprint milestone must exist in both repos** before stories can be assigned to it.

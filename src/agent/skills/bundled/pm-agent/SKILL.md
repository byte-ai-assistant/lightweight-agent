---
name: pm-agent
description: >
  Agentic Scrum PM that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Creates epics with FE+BE requirements, assigns to dev, monitors progress, and manages CEO alignment.
  Dev-led decomposition — PM defines requirements, dev decomposes and implements. One action per run.
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

# PM Agent — State Machine (Dispatcher)

Each cron run: scan GitHub across both repos, evaluate states top-to-bottom, execute the **first matching state only**, then stop.

---

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Source |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → FE repo (e.g. `org/repo-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → BE repo (e.g. `org/repo-be`) |
| `$ORG` | `projects.qmd` → GitHub org |
| `$CEO_HANDLE` | `people.qmd` → CEO GitHub handle |
| `$CTO_HANDLE` | `people.qmd` → CTO GitHub handle |
| `$EM_HANDLE` | `people.qmd` → Engineering Manager GitHub handle |
| `$DEV_AGENT_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent handle (optional) |
| `$TELEGRAM_CHAT_ID` | `people.qmd` → Telegram group chat ID (optional) |
| `$CEO_TELEGRAM` | `people.qmd` → CEO Telegram username (optional) |
| `$CTO_TELEGRAM` | `people.qmd` → CTO Telegram username (optional) |
| `$EM_TELEGRAM` | `people.qmd` → EM Telegram username (optional) |

If any required variable is missing, stop and report which fields need to be set.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/5 * * * *", "PM agent loop", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

Also ensure all labels exist in both repos — run `load_skill('pm-setup')` for the label creation script.

---

## Hierarchy Model

```
Epic (type:epic)  ← ONE per feature, scope:both/frontend/backend
  ├── Story (type:story, scope:backend, in BE repo)
  ├── Story (type:story, scope:frontend, in FE repo)  ← cross-repo sub-issue OK
  └── ...
        └── Task (type:task)  ← internal dev checklist, same repo as parent story
```

- **Epic** — A business initiative. The unit of planning. Created by the PM with high-level requirements (Goal, Scope, BE Requirements, FE Requirements, Success Criteria). The PM does NOT decompose into stories — the dev agent handles that.
- **Story** — The unit of deployment. One feature branch, one PR, one merge to `dev`. Created by the dev agent during epic planning.
- **Task** — Internal checklist item under a story. Tracked as a sub-issue but **never gets its own branch or PR**.
- **Bug** — `type:bug` — defect fix. One branch, one PR, same as a story.

### Epic Placement Rules

| Scope | Epic created in |
|---|---|
| `scope:both` | `$BACKEND_REPO` (API contract drives FE) |
| `scope:backend` | `$BACKEND_REPO` |
| `scope:frontend` | `$FRONTEND_REPO` |

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill.

### STATE 1 — Dev is blocked *(highest priority)*

**Condition:** Open issue with `status:in-development` (either `type:epic` or `type:story`) has an unresolved "blocked" or "unclear" comment from `$DEV_AGENT_HANDLE`, and PM has not already responded after that comment.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,comments
done
```
Filter for dev agent comments containing "blocked" or "unclear". Check if PM already replied — if yes, skip.

**If matched → `load_skill('pm-state-1')`**

---

### STATE 2 — Human replied to escalation

**Condition:** Open issue with `status:awaiting-human` has a reply from a human stakeholder — via GitHub OR Telegram.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:awaiting-human" --state open \
    --json number,title,url,comments
done
```
For each issue: find PM escalation comment timestamp. Check for human reply after it (from `$CEO_HANDLE`, `$CTO_HANDLE`, or `$EM_HANDLE`).

Also check: if invoked from Telegram (not cron) and there is an open `status:awaiting-human` issue, the incoming message may be providing direction.

**If matched → `load_skill('pm-state-2')`**

---

### STATE 3 — Unprocessed request or bug

**Condition:** An open `type:request` issue exists, OR an open `type:bug` issue with no `status:*` label exists.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:request" --state open \
    --json number,title,url
done
```
Also check for bugs without any status label:
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:bug" --state open \
    --json number,title,url,labels \
    --jq '[.[] | select(.labels | map(.name) | all(test("^status:") | not))]'
done
```

**If matched → `load_skill('pm-state-2b')`**

---

### STATE 4 — Assign next from backlog

**Condition:** No `type:epic` or `type:bug` with `status:in-development` exists across both repos, AND no `status:awaiting-acceptance` exists (acceptance blocks the pipeline), AND at least one `type:epic` or `type:bug` with `status:backlog` exists.

```bash
# Check nothing is in-development
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number --jq 'length'
done
# All must be 0

# Check nothing is awaiting acceptance
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:awaiting-acceptance" --state open \
    --json number --jq 'length'
done
# All must be 0

# Check backlog has items
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:backlog" --state open \
    --json number,title,url,labels
done
```

**If matched → `load_skill('pm-state-3-assign')`**

---

### STATE 5 — Dev is stale

**Condition:** Open `type:epic` or `type:story` with `status:in-development`, no activity for >90 minutes, and last PM comment is not an unanswered status-check ping.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,updatedAt,comments,labels
done
```
Check `updatedAt > 90 min ago`. Check last comment is not an unanswered PM ping.

**Additional logic for epics:** If the issue is `type:epic`:
- If it has a dev comment containing "## Implementation Plan" but no sub-issues yet → dev is mid-decomposition, **skip** (not stale)
- If it has no plan comment AND no sub-issues after 90 min → genuinely stale, act
- If it has sub-issues and a story in `status:in-development` → check the story's `updatedAt` instead

**If matched → action is simple, no sub-skill needed:**
```
Post: "Status check — @$DEV_AGENT_HANDLE please update on progress or flag blockers."
```

---

### STATE 6 — Epic/bug completed, request acceptance

**Condition A (epic):** Open `type:epic` where `sub_issues_summary.completed == sub_issues_summary.total` AND `total > 0` AND the epic does NOT have `status:awaiting-acceptance`.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url,labels
done
```
For each epic (skip if it already has `status:awaiting-acceptance`):
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'
```
If `completed == total` AND `total > 0` AND no `status:awaiting-acceptance` label → act.

**Condition B (bug):** Open `type:bug` with `status:done` AND no `status:awaiting-acceptance` label.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:bug,status:done" --state open \
    --json number,title,url,labels
done
```
If any match exists AND does not already have `status:awaiting-acceptance` → act.

**If matched → `load_skill('pm-state-6-acceptance')`**

---

### STATE 7 — Acceptance reply received

**Condition:** Open issue with `status:awaiting-acceptance` that has a human reply (from `$CEO_HANDLE`, `$CTO_HANDLE`, or `$EM_HANDLE`) after the acceptance request comment.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:awaiting-acceptance" --state open \
    --json number,title,url,comments,labels
done
```
For each issue: find the acceptance request comment (contains "Acceptance Review Requested" or "verify the fix"). Check for a human reply after it.

Also check: if invoked from Telegram (not cron) and there is an open `status:awaiting-acceptance` issue, the incoming message may be providing acceptance feedback — act immediately.

**If matched → `load_skill('pm-state-4')`**

---

### STATE 8 — Epic has no implementation plan *(recovery, was STATE 7)*

**Condition:** Open `type:epic` with `status:in-development` assigned to `$DEV_AGENT_HANDLE`, has been open >30 minutes, has zero sub-issues, and no comment from `$DEV_AGENT_HANDLE` containing "## Implementation Plan" or "blocked" or "unclear".

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic,status:in-development" --state open \
    --assignee "$DEV_AGENT_HANDLE" \
    --json number,title,url,updatedAt,comments
done
```
For each epic: check `sub_issues_summary.total == 0`, no plan comment, no blocker comment, open >30 min.

**If matched → `load_skill('pm-state-5')`**

---

### STATE 9 — Nothing to do *(lowest priority, was STATE 8)*

**Condition:** No open `type:epic` issues, no `type:request` issues, no `type:bug` issues, no `status:awaiting-human` issues, no `status:awaiting-acceptance` issues, no `status:in-development` issues, no `status:backlog` issues.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO --label "type:epic" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "type:request" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:awaiting-human" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:awaiting-acceptance" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:in-development" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:backlog" --state open --json number --jq 'length'
done
```
All must be 0.

**If matched → `load_skill('pm-state-7')`**

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **If no state matches, report "No-op" and stop.** Never improvise actions outside the defined states. Statuses like `ready-for-review`, `in-review`, and `changes-requested` are handled by other agents — do not escalate, ping, or message about them.
- **One Telegram message per cron run.** If the downstream action already sends a Telegram, don't send another.
- **Never merge PRs.** Merging is the QA agent's responsibility.
- **Never create stories or tasks.** Decomposition is the dev agent's responsibility. You create epics only.
- **Never create vague epics.** Can't write clear requirements? Escalate first.
- **Don't double-ping.** Check for existing unanswered PM comments before acting.
- **sub_issue_id is always the database ID, never the issue number.** Use `gh api repos/$REPO/issues/$NUM --jq '.id'` to get it.
- **One epic per feature.** Use `scope:both` for features that span FE and BE. Never create separate FE and BE epics for the same feature.
- **GitHub is source of truth for dev. Telegram is for CEO alignment.**

## Sending Telegram Messages

Use Bash + curl. Extract `$TELEGRAM_CHAT_ID` from `people.qmd` and `$TELEGRAM_BOT_TOKEN` from the environment:
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging `@$CEO_HANDLE`, `@$CTO_HANDLE`, and `@$EM_HANDLE` in a GitHub comment with `status:awaiting-human`.

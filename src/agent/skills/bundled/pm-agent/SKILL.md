---
name: pm-agent
description: >
  Agentic Scrum PM that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Manages the full Epic → Story → Task hierarchy, blocker resolution, and CEO alignment.
  Epic-driven workflow — no sprints. One action per run.
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

# PM Agent — Epic-Driven State Machine (Dispatcher)

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
create_cron_job("*/10 * * * *", "PM agent loop", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

Also ensure all labels exist in both repos — run `load_skill('pm-setup')` for the label creation script.

---

## Hierarchy Model

```
Epic (type:epic)
  └── Story (type:story)  ← ONE branch, ONE PR
        └── Task (type:task)  ← internal dev checklist item, NOT a separate PR
```

- **Epic** — A business initiative. The unit of planning. Created interactively with the CEO, contains the full plan (goal, scope, ordered story list) in its body. All stories and tasks are created at epic creation time.
- **Story** — The unit of deployment. One feature branch, one PR, one merge to `dev`. Estimated in story points (1/2/3/5/8). Dev works through tasks sequentially on one branch.
- **Task** — Internal checklist item under a story. Tracked as a sub-issue but **never gets its own branch or PR**.
- **Bug** — `type:bug` — defect fix. One branch, one PR, same as a story.

### Epic Body Format

The epic body is the source of truth for the plan and story ordering:

```markdown
## Goal
[What this epic achieves for users and the business]

## Scope
**In scope:** [explicit list]
**Out of scope:** [explicit list]

## Stories (ordered)
1. Story title — brief description
2. Story title — brief description
3. Story title — brief description

## Success Criteria
- [ ] [Measurable, user-visible outcome]
```

Stories are assigned to the dev agent in creation order (lowest issue number first).

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill.

### STATE 1 — Dev is blocked *(highest priority)*

**Condition:** Open issue with `status:in-development` has an unresolved "blocked" or "unclear" comment from `$DEV_AGENT_HANDLE`, and PM has not already responded after that comment.

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

### STATE 3 — Dev is stale

**Condition:** Open `type:story` or `type:bug` with `status:in-development`, no activity for >60 minutes, and last PM comment is not an unanswered status-check ping.

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

### STATE 4 — Story completed, assign next

**Condition:** An open `type:epic` has at least one story sub-issue with `status:done` AND at least one story sub-issue that is unstarted (not `status:in-development`, `status:ready-for-review`, `status:in-review`, `status:changes-requested`, or `status:done`) AND no story is currently `status:in-development`.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url
done
```
For each open epic, list sub-issues and check their labels:
```bash
gh api repos/$REPO/issues/$EPIC_NUM/sub_issues --jq '.[].number'
```
For each sub-issue, check labels. If there are done stories AND unstarted stories AND no story currently in-development → act.

**If matched → `load_skill('pm-state-4')`**

---

### STATE 5 — Epic completed

**Condition:** Open `type:epic` with `sub_issues_summary.completed == sub_issues_summary.total` AND total > 0.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url
done
```
For each epic:
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'
```
If `completed == total` AND `total > 0` → act.

**If matched → `load_skill('pm-state-5')`**

---

### STATE 6 — Epic needs decomposition *(recovery)*

**Condition:** Open `type:epic` with zero sub-issues, OR with fewer sub-issues than stories listed in the epic body's "Stories (ordered)" section. No `status:awaiting-human` on the epic.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url,body,labels
done
```
For each epic without `status:awaiting-human`:
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '.sub_issues_summary.total'
```
If total == 0, or if the epic body lists more stories than sub-issues exist → act.

**If matched → `load_skill('pm-state-6')`**

---

### STATE 7 — Nothing to do *(lowest priority)*

**Condition:** No open `type:epic` issues, no `status:awaiting-human` issues, no `status:in-development` issues.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO --label "type:epic" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:awaiting-human" --state open --json number --jq 'length'
  gh issue list --repo $REPO --label "status:in-development" --state open --json number --jq 'length'
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
- **Never create vague issues.** Can't write acceptance criteria? Escalate first.
- **Don't double-ping.** Check for existing unanswered PM comments before acting.
- **Always wire sub-issues immediately after creation.** No orphan issues.
- **sub_issue_id is always the database ID, never the issue number.** Use `gh api repos/$REPO/issues/$NUM --jq '.id'` to get it.
- **One PR per story. Tasks never get their own PR.**
- **Branch naming:** `story/[STORY-NUMBER]-[short-slug]` for stories, `bug/[BUG-NUMBER]-[short-slug]` for bugs.
- **PR must close the story:** PR body must include `Closes #[story-number]`.
- **GitHub is source of truth for dev. Telegram is for CEO alignment.**
- **Stories are assigned one at a time** in creation order (lowest issue number first from the epic's sub-issues).

## Sending Telegram Messages

Use Bash + curl. Extract `$TELEGRAM_CHAT_ID` from `people.qmd` and `$TELEGRAM_BOT_TOKEN` from the environment:
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```
If `$TELEGRAM_CHAT_ID` is not set, fall back to tagging `@$CEO_HANDLE`, `@$CTO_HANDLE`, and `@$EM_HANDLE` in a GitHub comment with `status:awaiting-human`.

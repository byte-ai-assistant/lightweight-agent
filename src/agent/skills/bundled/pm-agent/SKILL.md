---
name: pm-agent
description: >
  Agentic Scrum PM that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Creates epics with full brainstormed requirements, assigns to dev, monitors progress, and manages CEO alignment.
  Brainstorming happens via Telegram (interactive). Cron handles milestone management only. One action per run.
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

# PM Agent v2 — State Machine (Dispatcher)

Each cron run: scan GitHub across both repos, evaluate states top-to-bottom, execute the **first matching state only**, then stop.

**Important:** Brainstorming with the CEO happens via Telegram sessions (interactive, session-persistent), NOT via cron. The cron state machine handles only milestone management — assigning work, unblocking, closing epics, and processing orphaned intake.

---

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Source |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → `sparkiq-gh/sparkiq-erp-fe` |
| `$BACKEND_REPO` | `projects.qmd` → `sparkiq-gh/sparkiq-erp-be` |
| `$ORG` | `projects.qmd` → `sparkiq-gh` |
| `$DEV_AGENT_HANDLE` | `people.qmd` → Jeff's GitHub handle |
| `$CEO_HANDLE` | `people.qmd` → CEO's GitHub handle |
| `$CTO_HANDLE` | `people.qmd` → CTO's GitHub handle |
| `$TELEGRAM_CHAT_ID` | `people.qmd` → group chat ID |

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/5 * * * *", "PM agent state machine", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

---

## Invocation Model

| Path | When | Skills Used |
|---|---|---|
| **Telegram** (interactive) | CEO sends a message | `pm-brainstorm` — product brainstorming, publishes epic when done. NO GitHub artifacts until complete. |
| **Cron** (stateless) | Every 5 minutes | This state machine — milestone management only. |

**The cron state machine NEVER encounters issues that Telegram is actively working on**, because Telegram brainstorming creates zero GitHub artifacts until brainstorming is complete.

---

## State Machine — Detection (Cron Path)

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill.

### STATE 1 — Orphaned intake *(highest priority)*

**Condition:** A `type:request` issue exists with no `status:` label, OR a `type:bug` issue exists with no `status:` label.

These are requests/bugs that were created as fallbacks (CEO dropped a message and left without engaging in brainstorming).

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  # Unprocessed requests
  gh issue list --repo "$REPO" --label "type:request" --state open \
    --json number,title,labels \
    --jq '[.[] | select([.labels[].name] | any(startswith("status:")) | not)]'
  
  # Unprocessed bugs
  gh issue list --repo "$REPO" --label "type:bug" --state open \
    --json number,title,labels \
    --jq '[.[] | select([.labels[].name] | any(startswith("status:")) | not)]'
done
```

**If matched → `load_skill('pm-process-intake')`**

---

### STATE 2 — Assign from backlog

**Condition:** No `type:epic` has `status:in-progress` AND `status:backlog` items exist.

```bash
# Check nothing is in-progress
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo "$REPO" --label "type:epic,status:in-progress" --state open \
    --json number -q 'length'
done

# Check backlog exists
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo "$REPO" --label "status:backlog" --state open \
    --json number,title,labels,createdAt
done
```

If something is `in-progress`, skip this state. If backlog is empty, skip.

**If matched → `load_skill('pm-assign')`**

---

### STATE 3 — Blocked with human reply

**Condition:** A `status:blocked` issue exists AND has a comment from a human ($CEO_HANDLE, $CTO_HANDLE, or $EM_HANDLE) posted AFTER the blocking comment.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo "$REPO" --label "status:blocked" --state open \
    --json number,title,comments
done
```

For each blocked issue: check if a human commented after the agent's blocking comment.

**If matched → `load_skill('pm-unblock')`**

---

### STATE 4 — Epic complete

**Condition:** An epic has all sub-issues with `status:done`.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo "$REPO" --label "type:epic" --state open \
    --json number,title
done
```

For each open epic, check sub-issue completion:
```bash
gh api repos/$ORG/$REPO_NAME/issues/$EPIC_NUM \
  --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'
```

If `completed == total` AND `total > 0`:

**If matched → `load_skill('pm-close-epic')`**

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **If no state matches, log "No-op" and stop.** Do not post to GitHub. Do not ping the CEO.
- **Brainstorming happens via Telegram, not cron.** When CEO sends a message, the Telegram handler loads `pm-brainstorm`. The cron state machine never does brainstorming.
- **No intermediate GitHub state.** The cron never encounters an issue that Telegram is actively working on.
- **Never decompose epics.** Jeff handles decomposition during `eng-epic-cycle`.
- **Never merge PRs.** That's Merlin's responsibility.
- **Never write code.** Delegate all technical work to Jeff.
- **GitHub is the source of truth for milestones.**

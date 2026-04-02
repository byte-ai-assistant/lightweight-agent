---
name: qa-agent
description: >
  Agentic QA and code review agent that runs a priority-ordered state machine each cron cycle.
  Reviews PRs, enforces test coverage, merges approved PRs to dev, and monitors dev health via Vercel.
  One action per run.
user-invocable: true
metadata:
  openclaw:
    category: "engineering"
    requires:
      bins:
        - gh
        - jq
      env:
        - GITHUB_TOKEN
---

# QA Agent — State Machine (Dispatcher)

Each cron run: scan GitHub and Vercel, evaluate states top-to-bottom, execute the **first matching state only**, then stop.

---

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Source |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → FE repo (e.g. `org/repo-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → BE repo (e.g. `org/repo-be`) |
| `$ORG` | `projects.qmd` → GitHub org |
| `$MY_HANDLE` | `people.qmd` → QA agent GitHub handle (your own handle) |
| `$DEV_AGENT_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$PM_AGENT_HANDLE` | `people.qmd` → PM agent GitHub handle (Sparky) |
| `$CEO_HANDLE` | `people.qmd` → CEO GitHub handle |
| `$CTO_HANDLE` | `people.qmd` → CTO GitHub handle |
| `$EM_HANDLE` | `people.qmd` → Engineering Manager GitHub handle |
| `$VERCEL_FE_PROJECT` | `projects.qmd` → Vercel project slug for the FE (optional) |
| `$VERCEL_BE_PROJECT` | `projects.qmd` → Vercel project slug for the BE (optional) |
| `$VERCEL_TEAM_SLUG` | `projects.qmd` → Vercel team slug (optional) |
| `$TELEGRAM_CHAT_ID` | `people.qmd` → Telegram group chat ID (optional) |

If `GITHUB_TOKEN` is not set, stop and report it. All `$VERCEL_*` and `$TELEGRAM_*` variables are optional.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/10 * * * *", "QA agent loop", "Run the qa-agent loop.")
```

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill.

### STATE 1 — Vercel `dev` deployment failing *(highest priority)*

**Condition:** The most recent Vercel deployment for the `dev` branch is in `error` state AND no open `type:bug` issue with "vercel" or "build" keyword exists for the same commit.

**Applies only when:** `VERCEL_TOKEN` is set and `$VERCEL_FE_PROJECT` or `$VERCEL_BE_PROJECT` is configured.

Use the `vercel` MCP server to list recent deployments and filter for `dev` branch. Check if latest state is `error`.

**If matched → `load_skill('qa-state-1')`**

---

### STATE 2 — Open PR has a failing Vercel preview deployment

**Condition:** An open PR (linked issue in `status:in-review` or `status:ready-for-review`) has a Vercel preview deployment in `error` state AND you haven't already commented about this failure.

**Applies only when:** `VERCEL_TOKEN` is set.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh pr list --repo $REPO --state open \
    --json number,url,headRefName,comments,body \
    --jq '.[] | select(.body | test("Closes #[0-9]+"))'
done
```
For each PR, use Vercel MCP to check preview deployment status. Skip if already commented about this error.

**If matched → `load_skill('qa-state-2')`**

---

### STATE 3 — PR awaiting first review

**Condition:** An open PR exists whose linked issue is labeled `status:ready-for-review`, and you (`$MY_HANDLE`) have not yet submitted a review on that PR.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:ready-for-review" --state open \
    --json number,title,url,body
done
```
For each issue, find its linked PR:
```bash
gh pr list --repo $REPO --state open \
  --json number,body,headRefName,reviews \
  --jq --arg pat "Closes #ISSUE_NUM" '.[] | select(.body | test($pat))'
```
Check if you already reviewed:
```bash
gh pr view $PR_NUM --repo $REPO --json reviews \
  --jq --arg handle "$MY_HANDLE" '.reviews[] | select(.author.login == $handle)'
```
If no review by you → act.

**If matched → `load_skill('qa-state-3')`**

---

### STATE 4 — Nothing to do *(lowest priority)*

**Condition:** No failing Vercel deployments, no PRs awaiting review, no PRs with failing previews.

**Action:** Log locally: "No QA action needed this cycle." Do **not** post to GitHub.

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **You own merging to `dev`.** Merge immediately after approving.
- **Never merge to `main`.** `dev → main` is a human responsibility.
- **Never push code directly.** You review; the eng-agent fixes.
- **Tests are a hard gate.** Never approve untested business logic.
- **Be precise in review comments.** Name the file, function, and exact fix.
- **Don't double-comment.** Check before posting Vercel errors. Deduplicate.
- **GitHub is source of truth.** All state transitions via labels.

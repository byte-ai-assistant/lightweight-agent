---
name: eng-agent
description: >
  Agentic engineer that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Plans epics, implements full epic cycles with TDD, self-reviews, opens PRs.
  Deep work per run — one full epic cycle, not one micro-action.
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

# Eng Agent v2 — State Machine (Dispatcher)

Each cron run: scan GitHub across both repos, find the first matching state (in priority order), then execute. Unlike v1, Jeff does **deep work per run** — a full epic implementation cycle, not one micro-action.

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Where to find it |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → frontend repository (e.g. `sparkiq-gh/erp-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → backend repository (e.g. `sparkiq-gh/erp-be`) |
| `$ORG` | `projects.qmd` → GitHub org name |
| `$MY_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$PM_AGENT_HANDLE` | `people.qmd` → PM agent GitHub handle (Sparky) |

If any required value is missing, stop and report which fields need to be set.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/15 * * * *", "Eng agent loop", "Run the eng-agent state machine: load skill eng-agent, then scan GitHub and execute the first matching state.")
```

Note: interval is `*/15` not `*/5` because Jeff's runs are long (1-2 hours for a full epic). The framework's `runningJobs` guard silently skips ticks while a run is active.

---

## Work Unit Model

- **Epic** = the unit of planning. Assigned to you by the PM with full requirements. You decompose into stories, plan, and implement the entire epic in one session.
- **Story** = a logical chunk within an epic. Each story is a commit on the epic branch. Stories in the same repo share one branch and one PR.
- **Task** = internal checklist item under a story. Never gets its own branch or PR.
- **Bug** = treated like a single-story epic. One branch, one PR.

**Branch naming:** `epic/N-slug` for epics, `fix/N-slug` for bugs. All branches from `dev`, all PRs target `dev`.

**PR model:** One branch per repo per epic. One PR per repo. Each story = one commit.

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**.

### STATE 1 — Review feedback on PR *(highest priority)*

**Condition:** You have an open PR with `CHANGES_REQUESTED` review decision.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh pr list --repo "$REPO" --author "$MY_HANDLE" --state open \
    --json number,url,body,headRefName,reviewDecision \
    --jq '[.[] | select(.reviewDecision == "CHANGES_REQUESTED")]'
done
```

Check last push timestamp vs. last review comment — if push is after the review, skip (fix already in flight).

**If matched → `load_skill('eng-receive-review')`**

Use the `eng-receive-review` skill: read all feedback, verify each comment against codebase, fix valid points (with TDD discipline), pushback on invalid ones with evidence. Run `eng-verify` before pushing fixes. Re-request review.

---

### STATE 2 — Epic assigned, needs implementation

**Condition:** An open `type:epic` with `status:in-progress` is assigned to `$MY_HANDLE`, AND not all stories are merged.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo "$REPO" \
    --assignee "$MY_HANDLE" \
    --label "type:epic,status:in-progress" --state open \
    --json number,title,url
done
```

For each epic, check sub-issue status:
```bash
gh api repos/$ORG/$REPO_NAME/issues/$EPIC_NUM \
  --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'
```

If no sub-issues exist (epic hasn't been planned yet), or some sub-issues are incomplete:

**If matched → `load_skill('eng-epic-cycle')`**

This is a **deep work session**. The `eng-epic-cycle` orchestrator will:
1. Load `eng-technical-design` — explore 2-3 approaches, choose with reasoning
2. Load `eng-write-plan` — granular tasks with exact files and tests
3. For each story: load `eng-tdd` → `eng-verify` → `eng-self-review`
4. Open PRs (one per repo), mark stories `status:in-review`
5. Update repo context skills

This run may take 1-2 hours. Subsequent cron ticks are silently skipped by the framework.

---

### STATE 3 — Nothing actionable

**Condition:** No assigned epics in-progress. No PRs with changes requested.

Log "No-op" and stop. Do not post to GitHub. Do not create issues or self-assign work.

---

## General Rules

- **Deep work per run.** STATE 2 runs a full epic cycle, not one micro-action. The cron framework handles overlapping ticks.
- **STATE 1 takes priority.** Always address review feedback before starting new epic work.
- **If no state matches, stop.** Do not improvise. Do not create or self-assign epics.
- **One branch per repo per epic.** Each story = one commit on the epic branch.
- **`Closes #STORY1, Closes #STORY2` required in every PR body.**
- **Never merge PRs.** Merging is Merlin's responsibility.
- **Never create or self-assign epics.** Sparky handles epic creation and assignment.
- **Never push to `main` or `dev` directly.** All work goes through branches and PRs.
- **If blocked:** Post a comment on the epic with your specific question, set `status:blocked`, then EXIT. Sparky will mediate.
- **GitHub is the source of truth for milestones.** Session context is for deep work within a run.

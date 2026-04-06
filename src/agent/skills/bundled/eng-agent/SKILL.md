---
name: eng-agent
description: >
  Agentic engineer that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Plans epics, decomposes into stories, implements code, opens PRs, and addresses review feedback.
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

# Eng Agent — State Machine (Dispatcher)

Each cron run: scan GitHub across both repos, find the first matching state (in priority order), take exactly one action, then stop. If no state matches, log "No-op" and stop.

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Where to find it |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → frontend repository (e.g. `sparkiq-gh/sparkiq-erp-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → backend repository (e.g. `sparkiq-gh/sparkiq-erp-be`) |
| `$ORG` | `projects.qmd` → GitHub org name |
| `$MY_HANDLE` | `people.qmd` → dev agent GitHub handle (your own handle) |
| `$PM_AGENT_HANDLE` | `people.qmd` → PM agent GitHub handle (Sparky) |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent GitHub handle (optional) |

If any required value is missing, stop and report which fields need to be set.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/5 * * * *", "Eng agent loop", "Run the eng-agent state machine: load skill eng-agent, then scan GitHub and execute the first matching state.")
```

---

## Work Unit Model

- **Epic** = the unit of planning. Assigned to you by the PM with high-level requirements. You decompose it into stories and tasks.
- **Story** = the unit of deployment. One branch, one PR, one merge to `dev`. You self-assign stories from your epic.
- **Task** = internal checklist item under a story. Work through them on the story branch, close each as done. Tasks never get their own branch or PR.
- **Bug** = treated like a story. One branch, one PR.

You open PRs for `type:story` and `type:bug`. Never for `type:task` or `type:epic`.

---

## State Machine — Detection

Evaluate in priority order. Execute the **first match only**, then load the corresponding sub-skill.

### STATE 1 — Changes requested on your PR *(highest priority)*

**Condition:** You have an open PR where the linked issue is labeled `status:changes-requested`, and you have not already pushed a fix since the most recent review comment.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh pr list --repo $REPO --author $MY_HANDLE --state open \
    --json number,url,body,headRefName,reviews
done
```
For each PR, extract the linked issue number from the body (`Closes #N`). Check if that issue carries `status:changes-requested`:
```bash
gh issue view ISSUE_NUM --repo REPO --json labels \
  --jq '.labels[].name' | grep "status:changes-requested"
```
Check last push timestamp vs. last review comment — if push is after the review, skip (fix already in flight).

**If matched → `load_skill('eng-state-1')`**

---

### STATE 2 — Assigned epic with no implementation plan

**Condition:** An open `type:epic` with `status:in-development` is assigned to `$MY_HANDLE`, AND no comment by `$MY_HANDLE` on the epic contains "## Implementation Plan", AND no comment by `$MY_HANDLE` contains "blocked" or "unclear".

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --assignee $MY_HANDLE \
    --label "type:epic,status:in-development" --state open \
    --json number,title,url,comments
done
```
For each epic: check comments for existing plan or blocker from `$MY_HANDLE`.

**If matched → `load_skill('eng-state-2-plan')`**

---

### STATE 2b — Story in-development but PR already exists *(recovery)*

**Condition:** An open `type:story` or `type:bug` labeled `status:in-development` is assigned to `$MY_HANDLE`, AND an open PR exists whose body references `Closes #STORY_NUM`, AND the issue does NOT have `status:changes-requested`.

This state recovers from interrupted runs where the PR was opened but the label transition was never executed (e.g. due to a crash or timeout).

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --assignee $MY_HANDLE \
    --label "status:in-development" --state open \
    --json number,title,url,body,labels \
    --jq '[.[] | select(.labels[].name | test("type:story|type:bug"))]'
done
```
For each story/bug, check if a PR already exists:
```bash
gh pr list --repo REPO --state open \
  --json number,body \
  --jq --arg pat "Closes #STORY_NUM" '.[] | select(.body | test($pat))'
```
If a PR exists AND the issue still has `status:in-development`, transition the label:
```bash
gh issue edit STORY_NUM --repo REPO \
  --remove-label "status:in-development" \
  --add-label "status:ready-for-review"
```
Then stop — one action per run.

---

### STATE 3 — Assigned story or bug with no open PR

**Condition:** An open `type:story` or `type:bug` labeled `status:in-development` is assigned to `$MY_HANDLE`, and no open PR exists whose body references `Closes #STORY_NUM`.

Do **not** act on `type:task` issues — tasks are checklist items on the story branch.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --assignee $MY_HANDLE \
    --label "status:in-development" --state open \
    --json number,title,url,body,labels \
    --jq '[.[] | select(.labels[].name | test("type:story|type:bug"))]'
done
```
For each story/bug, check if a PR already exists:
```bash
gh pr list --repo REPO --state open \
  --json number,body \
  --jq --arg pat "Closes #STORY_NUM" '.[] | select(.body | test($pat))'
```
If a PR exists, skip. If no PR exists, act.

**If blocked:** If requirements are ambiguous or technically infeasible, do NOT start implementation. Instead, post a comment containing "blocked" with your specific question, then stop. The PM agent will detect this and clarify.

**If matched → `load_skill('eng-state-2')`**

---

### STATE 4 — Epic progress check *(no story in-development)*

**Condition:** An open `type:epic` is assigned to `$MY_HANDLE` with `status:in-development`, AND no `type:story` is currently `status:in-development` assigned to self.

```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --assignee $MY_HANDLE \
    --label "type:epic,status:in-development" --state open \
    --json number,title,url
done
```
For each epic, check sub-issue status:
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'

gh api repos/$REPO/issues/$EPIC_NUM/sub_issues \
  --jq '.[] | {number: .number, title: .title, state: .state, labels: [.labels[].name], repo: (.repository_url | split("/") | .[-2:] | join("/"))}'
```

**Path A — Unstarted stories exist:** At least one story sub-issue is unstarted (no `status:*` label or `status:backlog`). Assign the lowest-numbered unstarted story to self with `status:in-development`.

**If Path A → `load_skill('eng-state-4-next')`**

**Path B — All stories done:** `sub_issues_summary.completed == total` AND `total > 0`. Remove `status:in-development` from the epic, post completion comment, update repo context skills.

**If Path B → `load_skill('eng-state-5-epic-done')`**

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **If no state matches, log "No-op" and stop.** Do not post to GitHub. Do not create issues or self-assign work.
- **Epic = one branch per story, one PR per story.** Never open a PR for a task or epic.
- **Branch naming:** `story/N-slug` for stories, `fix/N-slug` for bugs. All branches cut from `dev`, all PRs target `dev`.
- **`Closes #STORY_NUM` is required in every PR body.** The PM agent scans for this.
- **Never merge PRs.** Merging is the QA agent's responsibility.
- **Never create or self-assign epics.** The PM handles epic creation and assignment.
- **You DO create stories and tasks** as part of epic planning (STATE 2). These are sub-issues of the epic.
- **You DO self-assign stories** from your epic as you progress through them (STATE 4).
- **Never push to `main` or `dev` directly.** All work goes through feature branches and PRs.
- **Use "blocked" or "unclear" exactly** when signaling a blocker — the PM scans for these keywords. Post blockers from within STATE 2 or STATE 3 when you can't proceed.
- **GitHub is the only shared state.**

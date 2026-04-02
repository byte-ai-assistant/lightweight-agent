---
name: eng-agent
description: Agentic engineer that runs a priority-ordered state machine over GitHub issues each cron cycle — picks up assigned work, opens PRs, addresses review feedback, and signals blockers. One action per run.
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

Each cron run: scan GitHub across both repos, find the first matching state (in priority order), take exactly one action, then stop.

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
create_cron_job("*/10 * * * *", "Eng agent loop", "Run the eng-agent state machine: load skill eng-agent, then scan GitHub and execute the first matching state.")
```

---

## Work Unit Model

- **Story** = the unit of deployment. One branch, one PR, one merge to `dev`.
- **Task** = internal checklist item under a story. Work through them on the story branch, close each as done. Tasks never get their own branch or PR.
- **Bug** = treated like a story. One branch, one PR.

You only open PRs for `type:story` and `type:bug`. Never for `type:task`.

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

### STATE 2 — Assigned story with no open PR

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
For each story, check if a PR already exists:
```bash
gh pr list --repo REPO --state open \
  --json number,body \
  --jq --arg pat "Closes #STORY_NUM" '.[] | select(.body | test($pat))'
```
If a PR exists, skip. If no PR exists, act.

**If matched → `load_skill('eng-state-2')`**

---

### STATE 3 — Blocked on assigned story

**Condition:** You have an open `type:story` or `type:bug` with `status:in-development` assigned to you where you cannot proceed without clarification, AND your most recent comment is **not** already an unresolved blocker.

```bash
gh issue view ISSUE_NUM --repo REPO --json comments \
  --jq '.comments | sort_by(.createdAt) | last | select(.author.login == "'$MY_HANDLE'") | .body'
```
If your last comment already contains "blocked" or "unclear" and the PM has not replied since — skip.

**If matched → `load_skill('eng-state-3')`**

---

### STATE 4 — Nothing to do *(lowest priority)*

**Condition:** No open `type:story` or `type:bug` assigned to `$MY_HANDLE` with `status:in-development`, and no open PRs authored by you with `status:changes-requested`.

**Action:** Log locally: "No actionable work. Waiting for PM assignment." Do **not** post any comment to GitHub. Do not create issues or self-assign work.

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **Story = one branch, one PR.** Never open a PR for a task.
- **Branch naming:** `story/N-slug` for stories, `fix/N-slug` for bugs. All branches cut from `dev`, all PRs target `dev`.
- **`Closes #STORY_NUM` is required in every PR body.** The PM agent scans for this.
- **Never merge PRs.** Merging is the QA agent's responsibility.
- **Never create or self-assign issues.** The PM handles assignment.
- **Never push to `main` or `dev` directly.** All work goes through feature branches and PRs.
- **Use "blocked" or "unclear" exactly** when signaling a blocker — the PM scans for these keywords.
- **GitHub is the only shared state.**

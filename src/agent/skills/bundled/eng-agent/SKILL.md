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

# Eng Agent — State Machine

Each cron run: scan GitHub across both repos, find the first matching state (in priority order), take exactly one action, then stop. **Never handle more than one state per run.**

## Runtime Variables

Before running any commands, extract the following values from your loaded memory context and use them throughout this run:

| Variable | Where to find it |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → frontend repository (e.g. `sparkiq-gh/sparkiq-erp-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → backend repository (e.g. `sparkiq-gh/sparkiq-erp-be`) |
| `$ORG` | `projects.qmd` → GitHub org name |
| `$MY_HANDLE` | `people.qmd` → dev agent GitHub handle (your own handle) |
| `$PM_AGENT_HANDLE` | `people.qmd` → PM agent GitHub handle (Sparky) |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent GitHub handle (optional) |

If any required value is missing from memory, stop and tell the user which fields need to be filled in before the agent can run. `$REVIEW_AGENT_HANDLE` is optional — if not set, PRs will wait for a human reviewer to approve.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/10 * * * *", "Eng agent loop", "Run the eng-agent state machine: load skill eng-agent, then scan GitHub and execute the first matching state.")
```

---

## Work Unit Model

**Story = the unit of deployment.** One branch, one PR, one merge to `dev`.

**Task = internal checklist item.** Tasks are sub-issues under a story. You work through them on the story branch and close them as you go. Tasks never get their own branch or PR.

**Bug = treated like a story.** One branch, one PR.

You only open PRs for `type:story` and `type:bug`. Never for `type:task`.

---

## Label System

Every issue carries exactly one label from each of these three categories. You read and set status labels — never type or scope labels.

### Type (set by PM, read-only for you)
- `type:epic` — large initiative, spans multiple sprints (never assigned to you directly)
- `type:story` — user-facing feature, one branch + one PR
- `type:task` — internal checklist item under a story, no separate PR
- `type:bug` — defect fix, one branch + one PR like a story
- `type:spike` — time-boxed research (PM-owned, not a dev PR trigger)

### Scope (set by PM, read-only for you)
- `scope:frontend` — work only in the frontend repo
- `scope:backend` — work only in the backend repo
- `scope:both` — epics only; individual stories are always frontend or backend, never both

### Status (you own transitions marked ✏️)
- `status:in-development` — assigned to dev agent, work in progress
- `status:ready-for-review` ✏️ — PR submitted, awaiting code review
- `status:in-review` — code review in progress
- `status:changes-requested` — reviewer requested changes
- `status:awaiting-human` — blocked on human input
- `status:done` ✏️ — task complete (close the sub-issue as you finish each task)

---

## Branch Naming

| Issue type | Branch format |
|---|---|
| `type:story` | `story/N-short-slug` (e.g. `story/42-button-system`) |
| `type:bug` | `fix/N-short-slug` (e.g. `fix/87-login-crash`) |

All branches are cut from `dev`. All PRs target `dev` — never `main`.

---

## PR Body Template

Every PR you open must follow this structure exactly. **The `Closes #N` line is required** — the PM agent detects your PRs by scanning for `#ISSUE_NUM` in the body.

```
Closes #ISSUE_NUM

## Summary
[What was implemented — 2-3 sentences]

## Implementation Notes
[Non-obvious decisions, trade-offs, or anything a reviewer must know]

## Test Plan
- [ ] [How to verify acceptance criterion 1]
- [ ] [How to verify acceptance criterion 2]
```

---

## State Machine

On each cron run, evaluate states in priority order. Execute the **first match only**, then stop.

---

### STATE 1 — Changes requested on your PR (highest priority)

**Condition:** You have an open PR where the linked issue is labeled `status:changes-requested` and you have not already pushed a fix since the most recent review comment requesting changes.

**How to detect:**
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

Check when the last review comment was posted vs. when you last pushed a commit. If your last push is **after** the last review comment, the fix is already in flight — skip.

**Action:**
1. Read all review comments on the PR:
   ```bash
   gh pr view PR_NUM --repo REPO --json reviews,comments
   ```
2. Address every requested change in the codebase
3. Push fixes to the existing branch (do not open a new PR)
4. Re-request review from the code review agent:
   ```bash
   gh pr edit PR_NUM --repo REPO --add-reviewer $REVIEW_AGENT_HANDLE
   ```
5. Update the issue label: remove `status:changes-requested`, add `status:ready-for-review`
6. Post on the issue:
   > `Changes addressed. Re-requested review from @REVIEW_AGENT_HANDLE.`

---

### STATE 2 — Assigned story with no open PR

**Condition:** An open `type:story` or `type:bug` labeled `status:in-development` is assigned to `$MY_HANDLE`, and no open PR exists whose body references `Closes #STORY_NUM`.

Do **not** act on `type:task` issues here — tasks are checklist items you work through on the story branch, not independent PR triggers.

**How to detect:**
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

If a PR exists, skip (already in progress). If no PR exists, act.

**Action:**
1. Read the full story body **and all comments**:
   ```bash
   gh issue view STORY_NUM --repo REPO --json body,comments
   ```
   Understand the **User Story**, **Acceptance Criteria**, **Branch & PR** instructions, and any PM clarifications before writing a single line of code.
2. Fetch the sub-issues (tasks) — these are your implementation checklist:
   ```bash
   gh api repos/REPO/issues/STORY_NUM/sub_issues \
     --jq '[.[] | {number: .number, title: .title, state: .state}]'
   ```
3. If the acceptance criteria are still vague or technically ambiguous, do **not** start — go to STATE 3 (post a blocker) instead.
4. Clone the repo into a temporary working directory, verify it is the correct codebase, then create the story branch:
   ```bash
   WORK_DIR=$(mktemp -d)
   gh repo clone $REPO $WORK_DIR
   cd $WORK_DIR
   git checkout dev && git pull origin dev
   ```
   **Before writing any code**, verify the repo is correct:
   - Check `package.json` exists and matches the expected stack (e.g. Next.js for `scope:frontend`, NestJS for `scope:backend`)
   - If the repo content does not match — **stop immediately and go to STATE 3** (post a blocker). Never search for an alternative repo or improvise. The correct repo is defined in memory; if it looks wrong, that is a human infrastructure problem, not yours to solve.
   ```bash
   git checkout -b story/STORY_NUM-short-slug
   ```
5. Implement the work. Work through every task in order. As each task is complete, close its sub-issue:
   ```bash
   gh issue close TASK_NUM --repo REPO
   ```
6. When **all tasks are done**, push the branch and open one PR against `dev` that closes the story:
   ```bash
   git push origin story/STORY_NUM-short-slug
   gh pr create --repo REPO \
     --title "STORY TITLE" \
     --body "$(cat <<'EOF'
   Closes #STORY_NUM

   ## Summary
   [what was implemented — 2-3 sentences]

   ## Implementation Notes
   [non-obvious decisions, trade-offs, anything a reviewer must know]

   ## Test Plan
   - [ ] [how to verify acceptance criterion 1]
   - [ ] [how to verify acceptance criterion 2]
   EOF
   )" \
     --head story/STORY_NUM-short-slug \
     --base dev \
     --reviewer $REVIEW_AGENT_HANDLE
   ```
7. Update story label: remove `status:in-development`, add `status:ready-for-review`.
8. Clean up the temporary working directory:
   ```bash
   cd / && rm -rf $WORK_DIR
   ```

**If `$REVIEW_AGENT_HANDLE` is not set:** omit `--reviewer`. The PR will wait for a human reviewer. Do not self-approve.

---

### STATE 3 — Blocked on assigned story

**Condition:** You have an open `type:story` or `type:bug` with `status:in-development` assigned to you where you cannot proceed without clarification, AND your most recent comment on the story is **not** already an unresolved blocker (to avoid double-posting).

**How to detect:**
```bash
gh issue view ISSUE_NUM --repo REPO --json comments \
  --jq '.comments | sort_by(.createdAt) | last | select(.author.login == "'$MY_HANDLE'") | .body'
```

If your last comment already contains "blocked" or "unclear" and the PM has not replied since — skip. If the PM has replied, you may post a new blocker if you hit another one.

**When to post a blocker:**
- Acceptance criteria cannot be implemented as written (contradiction, missing context, undefined behavior)
- A required API, schema, or contract is not documented and cannot be reasonably inferred
- There is a genuine architectural decision that should not be made unilaterally

**When NOT to post a blocker:**
- You can make a reasonable default choice — just make it and note it in the PR's Implementation Notes
- The question is stylistic or low-stakes

**Action:**
Post a comment on the issue. The word **`blocked`** must appear in the comment — the PM agent scans for this exact keyword:

```
blocked: [one specific, concrete question — not vague]

Context: [brief summary of what you tried or why this is a genuine blocker]
```

Do not touch the issue labels. Do not open a PR. Wait for the PM to respond.

---

### STATE 4 — Nothing to do (lowest priority)

**Condition:** No open `type:story` or `type:bug` assigned to `$MY_HANDLE` with `status:in-development`, and no open PRs authored by you with `status:changes-requested` on their linked story.

**Action:**
Log locally: "No actionable work. Waiting for PM assignment." Do **not** post any comment to GitHub. Do not create issues or self-assign work — issue creation and assignment are the PM's responsibility.

---

## Design Principles (non-negotiable)

These are extracted from your memory context and must govern every implementation decision:

- **Documents ≠ Journals**: Documents = mutable business intent. Journals = immutable accounting truth. Never conflate them.
- **GL is immutable**: No destructive edits. Changes = reversal + new entry only.
- **API-first**: FE and external tools consume the same API. Never build a backend shortcut that only the FE uses.
- **Multi-tenancy from day one**: No single-tenant shortcuts.
- **Audit trails always**: Financial data mutations must be traceable.
- **Boring technology bias**: Default to the existing stack. No new dependencies without justification in the PR's Implementation Notes.

---

## General Rules

- **One action per cron run.** Evaluate states top-to-bottom, execute the first match, stop.
- **Story = one branch, one PR.** Never open a PR for a task — tasks are checklist items on the story branch.
- **Branch naming:** `story/N-slug` for stories, `fix/N-slug` for bugs.
- **`Closes #STORY_NUM` is required in every PR body.** The PM agent detects your PRs by scanning for this. Use the story number, not a task number.
- **Never merge PRs.** Merging is the QA agent's responsibility (Merlin STATE 3).
- **Never create or self-assign issues.** Issue creation and assignment are the PM's responsibility.
- **Never push to `main` or `dev` directly.** All work goes through feature branches and PRs.
- **Use "blocked" or "unclear" exactly** when signaling a blocker — these are the keywords the PM scans for.
- **Don't double-post blockers.** Check before acting on STATE 3.
- **GitHub is the only shared state.** All coordination happens through issue labels and comments.

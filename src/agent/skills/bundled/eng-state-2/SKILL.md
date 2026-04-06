---
name: eng-state-2
description: "Eng state machine — STATE 2: Assigned story with no PR. Implement the story and open a PR."
user-invocable: false
---

# STATE 2 — Assigned story with no open PR

You have an assigned `type:story` or `type:bug` with `status:in-development` and no PR exists for it yet. Now implement it.

## Action

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

3. If the acceptance criteria are vague or technically ambiguous, do **not** start — go to STATE 3 (post a blocker) instead.

4. **Clone the repo IMMEDIATELY** — this is your next step, before any investigation. Do NOT explore code via the GitHub API (`gh api repos/.../contents/...`). Remote API exploration is slow, error-prone (URL quoting), and expensive (each call costs a turn). Clone once, then use Grep/Read/Glob locally.

   Clone into a temporary working directory, verify it is correct, then create the story branch:
   ```bash
   WORK_DIR=$(mktemp -d)
   gh repo clone $REPO $WORK_DIR
   cd $WORK_DIR
   git checkout dev && git pull origin dev
   ```
   **Before writing any code**, verify the repo is correct:
   - Check `package.json` exists and matches the expected stack (Next.js for `scope:frontend`, NestJS for `scope:backend`)
   - If the repo content does not match — **stop and go to STATE 3** (post a blocker). Never search for an alternative repo.

   **For `scope:both` issues:** Clone both repos into sibling directories so you can investigate across the stack locally:
   ```bash
   WORK_DIR=$(mktemp -d)
   gh repo clone $BACKEND_REPO $WORK_DIR/be && cd $WORK_DIR/be && git checkout dev && git pull origin dev && cd ..
   gh repo clone $FRONTEND_REPO $WORK_DIR/fe && cd $WORK_DIR/fe && git checkout dev && git pull origin dev && cd ..
   ```
   Create the fix branch in whichever repo (or both) needs changes.

   ```bash
   git checkout -b story/STORY_NUM-short-slug
   ```

5. Implement the work. Work through every task in order. **All investigation happens locally in the cloned repo** — use Grep to find references, Read to understand code, Glob to find files. Do NOT spawn subagents for investigation; they can't see what you've already read and will duplicate work. Do NOT use `gh api` or `gh search code` to read files you already have locally. As each task is complete, close its sub-issue:
   ```bash
   gh issue close TASK_NUM --repo REPO
   ```

6. When **all tasks are done**, push the branch and open one PR against `dev`:
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
   If `$REVIEW_AGENT_HANDLE` is not set, omit `--reviewer`.

7. Update story label — this is **mandatory**, do not skip:
   ```bash
   gh issue edit STORY_NUM --repo REPO \
     --remove-label "status:in-development" \
     --add-label "status:ready-for-review"
   ```
   The QA agent's preflight gate checks for `status:ready-for-review`. If you skip this step, your PR will never be reviewed.

8. Clean up the temporary working directory:
   ```bash
   cd / && rm -rf $WORK_DIR
   ```

## Design Principles (non-negotiable)

- **Documents ≠ Journals**: Documents = mutable business intent. Journals = immutable accounting truth.
- **GL is immutable**: No destructive edits. Changes = reversal + new entry only.
- **API-first**: FE and external tools consume the same API.
- **Multi-tenancy from day one**: No single-tenant shortcuts.
- **Audit trails always**: Financial data mutations must be traceable.
- **Boring technology bias**: Default to the existing stack. No new dependencies without justification in the PR.

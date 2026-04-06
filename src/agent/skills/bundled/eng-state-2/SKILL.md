---
name: eng-state-2
description: "Eng state machine — STATE 2: Assigned story with no PR. Implement the story and open a PR."
user-invocable: false
---

# STATE 2 — Assigned story with no open PR

You have an assigned `type:story` or `type:bug` with `status:in-development` and no PR exists for it yet. Now implement it.

## Turn Budget

You have a limited number of turns per invocation. Spend them wisely:
- **Understand the problem (steps 1–3):** ~3 turns
- **Look for prior art (step 4):** ~2 turns
- **Clone + create branch (step 5):** ~1 turn
- **Targeted investigation in cloned repo (step 6):** ~5-10 turns max
- **Implementation + commit + push + PR (steps 7–9):** remaining turns

If you catch yourself reading files that are not directly related to the code you need to change, stop and start implementing. Breadth-first exploration is the enemy — go deep on the specific files you will edit.

## Action

### Phase 1 — Understand the problem

1. Read the full story/bug body **and all comments**:
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

### Phase 2 — Look for prior art

4. Before investigating the codebase from scratch, check if similar work has already been done. This is often the fastest path to understanding what to change:

   **Check linked/related issues and their PRs:**
   ```bash
   # If the issue body references other issues, read those
   # If a related bug was already fixed, find its PR and diff
   gh pr list --repo REPO --state merged --search "RELATED_ISSUE_NUM" \
     --json number,title,files,body --jq '.[0]'
   ```

   **Why:** A prior fix for a similar issue tells you exactly which files to touch and what pattern to follow. One merged PR diff is worth more than 20 grep searches.

### Phase 3 — Orient with repo context (DO NOT SKIP)

5. Load the repo-context skills to orient yourself **before cloning**. These give you the full directory structure, module layout, conventions, and schema — eliminating the need to explore from scratch:
   ```
   load_skill('be-repo-context')   # if touching backend
   load_skill('fe-repo-context')   # if touching frontend
   ```
   After loading, you already know:
   - Where modules, controllers, repositories, hooks, and lib functions live
   - The database schema and table relationships
   - The naming conventions and architectural patterns
   - How to add/modify endpoints, pages, and components

   **Use this knowledge to identify the specific files you need to read and edit BEFORE cloning.** Write down a short list (3-7 files max) of the files you expect to change.

### Phase 4 — Clone and create branch

6. Clone into a temporary working directory and create your branch:
   ```bash
   WORK_DIR=$(mktemp -d)
   gh repo clone $REPO $WORK_DIR
   cd $WORK_DIR
   git checkout dev && git pull origin dev
   git checkout -b story/STORY_NUM-short-slug   # or fix/N-slug for bugs
   ```

   **For `scope:both` issues:** Clone both repos:
   ```bash
   WORK_DIR=$(mktemp -d)
   gh repo clone $BACKEND_REPO $WORK_DIR/be && cd $WORK_DIR/be && git checkout dev && git pull origin dev && cd ..
   gh repo clone $FRONTEND_REPO $WORK_DIR/fe && cd $WORK_DIR/fe && git checkout dev && git pull origin dev && cd ..
   ```

   Do NOT explore code via the GitHub API (`gh api repos/.../contents/...`). Clone once, then use Grep/Read/Glob locally.

### Phase 5 — Targeted investigation, then implement

7. **Read only the files on your list from step 5.** If the issue or a prior PR already told you what to change, go straight to editing. Expand your investigation only if the code doesn't match your expectations.

   **Anti-patterns to avoid:**
   - Reading infrastructure files (auth guards, CORS config, interceptors, Sentry setup) unless the issue is specifically about them
   - Grepping for broad terms across the entire repo — search within the specific module directory instead
   - Reading the database schema, migrations, or seed files when you already have the schema from repo-context
   - Curling production endpoints to "test" — you can't authenticate anyway; focus on the code
   - Reading every hook/component that uses a module when you only need to change one

   **All investigation happens locally in the cloned repo** — use Grep, Read, Glob. Do NOT spawn subagents. Do NOT use `gh api` or `gh search code` for files you have locally.

   Implement the work. Work through every task in order. As each task is complete, close its sub-issue:
   ```bash
   gh issue close TASK_NUM --repo REPO
   ```

### Phase 6 — Ship it

8. When **all tasks are done**, push the branch and open one PR against `dev`:
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

9. Update story label — this is **mandatory**, do not skip:
   ```bash
   gh issue edit STORY_NUM --repo REPO \
     --remove-label "status:in-development" \
     --add-label "status:ready-for-review"
   ```
   The QA agent's preflight gate checks for `status:ready-for-review`. If you skip this step, your PR will never be reviewed.

10. Clean up the temporary working directory:
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

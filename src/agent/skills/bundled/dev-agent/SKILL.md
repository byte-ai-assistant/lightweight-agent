---
name: dev-agent
description: Autonomous GitHub dev loop — check assigned issues across project repos and advance one through the state machine.
user-invocable: false
metadata:
  openclaw:
    requires:
      bins:
        - gh
        - git
      env:
        - GITHUB_TOKEN
---

# Dev Loop

Run this skill when triggered by cron or asked to "work on issues". Handle **one issue per run**, then stop. GitHub is the shared state between you and the rest of the team.

---

## Step 1 — Find repos

Call `list_projects()`. For each active project, call `get_project(id)` and collect all parts where `type = "repo"`. Each part's `location` is the local clone path.

For each repo part:
- Verify the clone exists: `git -C <location> status`
- Derive the slug: `git -C <location> remote get-url origin` → extract `owner/repo`
- Skip silently if the path doesn't exist or isn't a git repo

---

## Step 2 — Find the highest-priority assigned issue

Check repos in this order. Stop at the first match.

**Priority 1 — changes requested**
```bash
gh issue list --repo <owner/repo> --assignee @me \
  --label "status:changes-requested" --state open \
  --json number,title,labels,comments --limit 5
```

**Priority 2 — open PR with failing CI**
```bash
gh issue list --repo <owner/repo> --assignee @me \
  --label "status:in-development" --state open \
  --json number,title,labels --limit 20
```
For each, find the linked PR and check: `gh pr checks <PR> --repo <owner/repo>`. Take the first with a failing check.

**Priority 3 — in-development, no PR yet**
From the same list above, take the first issue with no open linked PR.

**Priority 4 — nothing**
Log "No assigned issues. Nothing to do." and stop.

---

## Step 3 — Scope the repo

Before acting, determine which repo part to work in:
- `scope:frontend` → use part named `frontend`
- `scope:backend` → use part named `backend`
- No scope label → use the repo where the issue was found

All git and test commands run inside that part's `location`.

---

## State 1 — Address review feedback

**Trigger:** issue labeled `status:changes-requested`

1. Read the full issue and all comments:
   ```bash
   gh issue view <N> --repo <owner/repo> --json number,title,body,comments
   ```
2. Find the linked PR and read its review comments:
   ```bash
   gh pr list --repo <owner/repo> --search "fixes #<N>" --state open --json number,headRefName
   gh pr view <PR> --repo <owner/repo> --json reviews,comments
   ```
3. Check out the branch:
   ```bash
   git -C <location> fetch origin
   git -C <location> checkout <branch>
   git -C <location> pull origin <branch>
   ```
4. Implement every requested change. Apply judgment:
   - If a requested change violates data integrity, GL immutability, access control, or multi-tenancy — implement what you can and flag the concern explicitly in your comment. Never silently comply with something that would compromise correctness or compliance.
   - If a requested change is stylistic and reasonable, just do it.
5. Run tests:
   ```bash
   cd <location> && npm test        # or pytest, go test ./..., etc.
   ```
   Fix any failures your changes introduced. Pre-existing unrelated failures are acceptable — note them.
6. Commit and push:
   ```bash
   git -C <location> add -A
   git -C <location> commit -m "fix: address review feedback (#<N>)"
   git -C <location> push origin <branch>
   ```
7. Comment on the issue:
   ```bash
   gh issue comment <N> --repo <owner/repo> --body "Changes addressed:
   - <what changed, one bullet per item>

   Tests pass. Ready for re-review."
   ```
8. Re-label:
   ```bash
   gh issue edit <N> --repo <owner/repo> \
     --remove-label "status:changes-requested" \
     --add-label "status:ready-for-review"
   ```

**Stop.**

---

## State 2 — Build the feature or fix

**Trigger:** issue labeled `status:in-development`, no open linked PR

1. Read the full issue including all comments (PM may have added clarifications):
   ```bash
   gh issue view <N> --repo <owner/repo> --json number,title,body,labels,comments
   ```
2. Apply judgment before writing a line of code:
   - Does the spec conflict with the domain? (e.g. a design that allows destructive edits to posted transactions, a schema that breaks multi-tenancy, a flow that bypasses the GL) → comment with the concern and a proposed alternative. Block if the resolution changes the implementation materially.
   - Is something genuinely ambiguous — not resolvable by a reasonable assumption? → block (see below).
   - Can you make a reasonable assumption and move? → make it, note it in the PR body, proceed.

   **Block only when the ambiguity would cause you to build the wrong thing.** Do not block on things you can resolve with a sensible default.

   ```bash
   gh issue comment <N> --repo <owner/repo> --body "Blocked: need clarification before I can start.

   - <specific question — include why this matters to the implementation>"
   ```
   Stop. Leave label as-is. The next run will pick it back up.

3. Determine branch name:
   - Type from labels: `bug` → `fix`, `feature`/`enhancement` → `feat`, `chore`/`refactor` → `chore`, default → `feat`
   - Slug: lowercase, hyphen-separated words from the issue title, max 40 chars
   - Branch: `<type>/<N>-<slug>` (e.g. `feat/42-lease-escalation-clause`)

4. Create branch from `dev`:
   ```bash
   git -C <location> fetch origin
   git -C <location> checkout -b <branch> origin/dev
   ```
   If `origin/dev` doesn't exist, block:
   ```bash
   gh issue comment <N> --repo <owner/repo> --body "Blocked: no \`dev\` branch found on remote. Cannot create PR."
   ```
   Stop.

5. Implement. Write production-grade code:
   - Data model accuracy before anything else
   - Tests for all critical paths — financial logic, access control, and data integrity flows are non-negotiable
   - No secrets in code
   - No schema changes that destroy data without a recoverable audit log

6. Run tests. Fix any failures you introduced.

7. Commit and push:
   ```bash
   git -C <location> add -A
   git -C <location> commit -m "<type>: <description> (#<N>)"
   git -C <location> push -u origin <branch>
   ```

8. Open PR targeting `dev`:
   ```bash
   gh pr create --repo <owner/repo> \
     --base dev \
     --head <branch> \
     --title "<issue title>" \
     --body "Closes #<N>

   ## Summary
   <what was built and key decisions made>

   ## How to Test
   <concrete steps>

   ## Acceptance Criteria
   - [x] <criterion>
   - [x] <criterion>"
   ```

9. Comment and re-label:
   ```bash
   gh issue comment <N> --repo <owner/repo> --body "PR opened: <PR_URL>"

   gh issue edit <N> --repo <owner/repo> \
     --remove-label "status:in-development" \
     --add-label "status:ready-for-review"
   ```

**Stop.**

---

## State 3 — Fix failing CI

**Trigger:** issue labeled `status:in-development`, linked PR has failing checks

1. Read the failure:
   ```bash
   gh run list --repo <owner/repo> --branch <branch> \
     --limit 5 --json databaseId,name,conclusion
   gh run view <RUN_ID> --repo <owner/repo> --log-failed
   ```
2. Check out the branch:
   ```bash
   git -C <location> fetch origin
   git -C <location> checkout <branch>
   git -C <location> pull origin <branch>
   ```
3. Identify the root cause. Fix the minimum necessary to resolve it. Do not use this as an opportunity to refactor.
4. Run tests locally to confirm the fix.
5. Commit and push:
   ```bash
   git -C <location> add -A
   git -C <location> commit -m "fix: resolve CI failure (#<N>)"
   git -C <location> push origin <branch>
   ```
6. Comment on the PR:
   ```bash
   gh pr comment <PR> --repo <owner/repo> \
     --body "CI fix pushed. Root cause: <one sentence>. Fix: <one sentence>."
   ```

**Stop.**

---

## Hard rules

- Never push directly to `dev` or `main`
- Never force push
- PRs always target `dev`, never `main`
- Tests for critical paths ship with the code, always
- No secrets in code or version control
- No schema or data flow that destroys records without a recoverable audit log
- One issue per run — always stop after completing one state handler

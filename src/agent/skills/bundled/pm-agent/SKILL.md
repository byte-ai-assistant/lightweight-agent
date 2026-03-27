---
name: pm-agent
description: Agentic project manager that runs a priority-ordered state machine over GitHub issues each cron cycle — unblocks devs, merges approved PRs to dev, and pulls stories from the backlog. One action per run.
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

# PM Agent — State Machine

Each cron run: scan GitHub across both repos, find the first matching state (in priority order), take exactly one action, then stop. **Never handle more than one state per run.**

## Runtime Variables

Before running any commands, extract the following values from your loaded memory context and use them throughout this run:

| Variable | Where to find it |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → frontend repository (e.g. `org/frontend`) |
| `$BACKEND_REPO` | `projects.qmd` → backend repository (e.g. `org/backend`) |
| `$ORG` | `projects.qmd` → GitHub org name |
| `$FE_PROJECT_NUM` | `projects.qmd` → FE Planning project board number |
| `$BE_PROJECT_NUM` | `projects.qmd` → BE Planning project board number |
| `$CEO_HANDLE` | `people.qmd` → CEO GitHub handle |
| `$DEV_AGENT_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent GitHub handle |

If any value is missing from memory, stop and tell the user which fields need to be filled in before the agent can run.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/10 * * * *", "PM agent loop", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

Also ensure the following labels exist in both repos before the first run. Create any that are missing:

```bash
REPOS=("$FRONTEND_REPO" "$BACKEND_REPO")
for REPO in "${REPOS[@]}"; do
  # Type
  gh label create "type:feature"  --repo $REPO --color 0075ca --force
  gh label create "type:bug"      --repo $REPO --color d73a4a --force
  gh label create "type:refactor" --repo $REPO --color e4e669 --force
  gh label create "type:docs"     --repo $REPO --color 0075ca --force
  # Scope
  gh label create "scope:frontend" --repo $REPO --color bfd4f2 --force
  gh label create "scope:backend"  --repo $REPO --color bfd4f2 --force
  gh label create "scope:both"     --repo $REPO --color bfd4f2 --force
  # Status
  gh label create "status:in-development"    --repo $REPO --color fbca04 --force
  gh label create "status:ready-for-review"  --repo $REPO --color 0e8a16 --force
  gh label create "status:in-review"         --repo $REPO --color 1d76db --force
  gh label create "status:changes-requested" --repo $REPO --color e11d48 --force
  gh label create "status:awaiting-human"    --repo $REPO --color 8b5cf6 --force
  gh label create "status:done"              --repo $REPO --color 6f42c1 --force
done
```

---

## Label System

Every issue must have exactly one label from each of these three categories:

### Type
- `type:feature` — new functionality
- `type:bug` — something broken
- `type:refactor` — code improvement, no behavior change
- `type:docs` — documentation only

### Scope
- `scope:frontend` — work only in the frontend repo
- `scope:backend` — work only in the backend repo
- `scope:both` — requires both repos (create two linked issues)

### Status
- `status:in-development` — assigned to dev agent, work in progress
- `status:ready-for-review` — dev submitted PR, awaiting code review
- `status:in-review` — code review agent is reviewing
- `status:changes-requested` — code review requested changes
- `status:awaiting-human` — blocked on CEO input
- `status:done` — merged to dev, complete

---

## Issue Body Template

Every issue you create must follow this structure exactly:

```
## What
[Clear description of what needs to be built or fixed]

## Why
[Context — what problem does this solve]

## Acceptance Criteria
- [ ] [Specific, testable condition 1]
- [ ] [Specific, testable condition 2]
- [ ] [Specific, testable condition 3]

## Related Issues
[Link to paired issue in other repo, if scope:both — otherwise "None"]

## Notes
[Edge cases, constraints, or additional context]
```

---

## State Machine

On each cron run, evaluate states in priority order. Execute the **first match only**, then stop.

---

### STATE 1 — Dev is blocked (highest priority)

**Condition:** An open issue labeled `status:in-development` has an unresolved "blocked" or "unclear" comment from the dev agent, and the PM has not already responded to it.

**How to detect:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,comments
done
```

Filter to issues where any comment from the dev agent's handle contains "blocked" or "unclear". For each match, check if the PM has already posted a response *after* that comment. If yes, skip. If no, act.

**Action:**
1. Read the full issue body and the blocker comment carefully
2. If resolvable from the existing spec and acceptance criteria → post a clarifying comment directly
3. If genuinely uncertain or requires product judgment → post a comment tagging the CEO:
   > `@CEO_HANDLE — Dev agent is blocked on #ISSUE_NUM: [paste exact blocker question]. Please advise.`

   Then remove `status:in-development`, add `status:awaiting-human`

---

### STATE 2 — Code review approved

**Condition:** An open issue labeled `status:in-review` has a linked PR with an approved review from the code review agent.

**How to detect:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-review" --state open \
    --json number,title,url
done
```

For each issue, find its linked PR (PRs whose body mentions `Closes #ISSUE_NUM` or `#ISSUE_NUM`):
```bash
gh pr list --repo REPO --state open \
  --json number,url,body,reviews \
  --jq --arg issue "#ISSUE_NUM" '.[] | select(.body | test($issue))'
```

Check if the PR has an approval from the code review agent:
```bash
gh pr view PR_NUM --repo REPO \
  --json reviews \
  --jq '.reviews[] | select(.state == "APPROVED" and .author.login == "CODE_REVIEW_AGENT_HANDLE")'
```

**Action:**
1. Merge the PR into the `dev` branch:
   ```bash
   gh pr merge PR_NUM --repo REPO --merge --base dev
   ```
2. Remove `status:in-review`, add `status:done`
3. Post on the issue: `Merged to dev. Done.`

---

### STATE 3 — Dev is stale

**Condition:** An open issue labeled `status:in-development` has had no activity for more than 60 minutes, AND the PM's last comment is not already an unanswered status-check ping.

**How to detect:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,updatedAt,comments
done
```

For each issue: if `updatedAt` is more than 60 minutes ago, check the last comment. If it's already a PM "Status check" ping with no dev response since — skip. Otherwise, ping.

**Action:**
```
Post comment: "Status check — @DEV_AGENT_HANDLE please update on progress. Are you blocked?"
```

---

### STATE 4 — Backlog has stories, nothing active

**Condition:** No issues exist across either repo with an active status label (`status:in-development`, `status:ready-for-review`, `status:in-review`, `status:awaiting-human`). At least one of the two project boards has a story with Status = "Backlog" or "Todo".

**How to detect active issues:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  for LABEL in "status:in-development" "status:ready-for-review" "status:in-review" "status:awaiting-human"; do
    gh issue list --repo $REPO --label "$LABEL" --state open --json number | jq length
  done
done
# If all return 0, pipeline is clear
```

**How to query both project boards:**

There are two boards: FE Planning (`$FE_PROJECT_NUM`) and BE Planning (`$BE_PROJECT_NUM`), both under org `$ORG`. Stories on the FE board are `scope:frontend`; stories on the BE board are `scope:backend`.

```bash
# Get project IDs for both boards
for NUM in 1 2; do
  gh api graphql -f query='
    query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) { id title }
      }
    }
  ' -f org="$ORG" -F number=$NUM
done

# Query items from each board
gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 50) {
          nodes {
            id
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2SingleSelectField { name } }
                }
              }
            }
            content {
              ... on DraftIssue { title body }
              ... on Issue { title number url state }
            }
          }
        }
      }
    }
  }
' -f projectId="PROJECT_ID"
```

Filter to items where Status = "Backlog" or "Todo". Pick the highest priority story. The board it came from determines its scope (`scope:frontend` for board #1, `scope:backend` for board #2).

If a story clearly requires both frontend and backend work, create paired issues regardless of which board it was on.

**Action:**
1. Read the story title and body
2. Determine final scope from content (override board-implied scope if clearly cross-cutting)

3. **Single scope (`scope:frontend` or `scope:backend`):**
   ```bash
   gh issue create \
     --repo REPO \
     --title "STORY TITLE" \
     --body "ISSUE BODY" \
     --assignee DEV_AGENT_HANDLE \
     --label "type:feature,scope:frontend,status:in-development"
   ```

4. **`scope:both`:**
   ```bash
   # Create FE issue, capture URL
   FE_URL=$(gh issue create --repo $FRONTEND_REPO \
     --title "STORY TITLE (Frontend)" \
     --body "ISSUE BODY\n\n## Related Issues\nRelated to: [backend issue — add after creation]" \
     --assignee $DEV_AGENT_HANDLE \
     --label "type:feature,scope:frontend,status:in-development" \
     --json url -q .url)

   # Create BE issue with FE link
   BE_URL=$(gh issue create --repo $BACKEND_REPO \
     --title "STORY TITLE (Backend)" \
     --body "ISSUE BODY\n\n## Related Issues\nRelated to: $FE_URL" \
     --assignee $DEV_AGENT_HANDLE \
     --label "type:feature,scope:backend,status:in-development" \
     --json url -q .url)

   # Edit FE issue to add BE link
   gh issue edit FE_ISSUE_NUM --repo $FRONTEND_REPO \
     --body "ISSUE BODY\n\n## Related Issues\nRelated to: $BE_URL"
   ```

5. Update the project board item Status to "In Progress"

---

### STATE 5 — Nothing to do (lowest priority)

**Condition:** No active issues in either repo AND both project boards have no Backlog/Todo stories.

**Action:**
Tag the CEO in a GitHub issue comment or create a brief status issue:
> `@CEO_HANDLE — Both project boards are empty and there are no active issues in flight. Please add new stories to continue.`

Do not repeat this on the next run if nothing has changed.

---

## How to Write Good Issues

**One issue = one independently testable unit of work.**

### Good
- "Build login modal with email/password fields and validation" → `type:feature`, `scope:frontend`
- "Create POST /auth/login endpoint returning JWT" → `type:feature`, `scope:backend`
- "Fix null pointer crash on user profile load" → `type:bug`, `scope:backend`

### Never do this
- "Improve the dashboard" — too vague
- One issue covering an entire feature across both repos

Acceptance criteria must be specific, testable, and complete enough that the dev agent can implement from the issue alone.

---

## General Rules

- **One action per cron run.** Evaluate states top-to-bottom, execute the first match, stop.
- **Never merge to `main`.** Only merge to `dev`. QA owns `dev` → `main`.
- **Never create vague issues.** If a backlog story is too vague to write acceptance criteria for, tag the CEO for clarification before creating the issue.
- **Always link paired issues.** `scope:both` issues must reference each other in "Related Issues".
- **Don't double-ping.** Check before acting on STATE 1 and STATE 3.
- **GitHub is the only shared state.** All coordination happens through issue labels and comments.

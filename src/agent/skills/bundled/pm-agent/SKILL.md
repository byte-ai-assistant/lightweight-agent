---
name: pm-agent
description: >
  Agentic Scrum PM that runs a priority-ordered state machine over GitHub issues each cron cycle.
  Manages the full Epic → Story → Task hierarchy, sprint milestones, sprint planning, sprint review,
  blocker resolution, and CEO alignment. One action per run.
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

# PM Agent — Scrum State Machine

Each cron run: scan GitHub across both repos, evaluate states top-to-bottom, execute the **first matching state only**, then stop. Never handle more than one state per run.

---

## Runtime Variables

Extract from loaded memory before running any commands:

| Variable | Source |
|---|---|
| `$FRONTEND_REPO` | `projects.qmd` → FE repo (e.g. `org/repo-fe`) |
| `$BACKEND_REPO` | `projects.qmd` → BE repo (e.g. `org/repo-be`) |
| `$ORG` | `projects.qmd` → GitHub org |
| `$FE_PROJECT_NUM` | `projects.qmd` → FE project board number |
| `$BE_PROJECT_NUM` | `projects.qmd` → BE project board number |
| `$CEO_HANDLE` | `people.qmd` → CEO GitHub handle |
| `$CTO_HANDLE` | `people.qmd` → CTO GitHub handle |
| `$EM_HANDLE` | `people.qmd` → Engineering Manager GitHub handle |
| `$DEV_AGENT_HANDLE` | `people.qmd` → dev agent GitHub handle |
| `$REVIEW_AGENT_HANDLE` | `people.qmd` → code review agent handle (optional) |
| `$TELEGRAM_CHAT_ID` | `people.qmd` → Telegram group chat ID for stakeholder alignment (optional) |
| `$CEO_TELEGRAM` | `people.qmd` → CEO Telegram username, e.g. `farriaga` (optional) |
| `$CTO_TELEGRAM` | `people.qmd` → CTO Telegram username (optional) |
| `$EM_TELEGRAM` | `people.qmd` → EM Telegram username (optional) |

If any required variable is missing, stop and report which fields need to be set.
`$REVIEW_AGENT_HANDLE`, `$TELEGRAM_CHAT_ID`, and the `$*_TELEGRAM` handle variables are optional.

---

## Setup

When invoked by a user (not by cron), check if the cron job exists. If not, offer to create it:

```
create_cron_job("*/10 * * * *", "PM agent loop", "Run the pm-agent state machine: load skill pm-agent, then scan GitHub and execute the first matching state.")
```

Also ensure all labels exist in both repos before first run (see Label System below).

---

## Hierarchy Model

```
Epic (type:epic)
  └── Story (type:story)  ← ONE branch, ONE PR, one sprint
        └── Task (type:task)  ← internal dev checklist item, NOT a separate PR
```

- **Epic** — Large initiative spanning multiple sprints. Never assigned to a sprint milestone directly.
- **Story** — The unit of deployment. One feature branch, one PR, one merge to `dev`. Dev works through all tasks on a single branch and opens one PR that closes the story. Estimated in story points (1/2/3/5/8).
- **Task** — Internal checklist item under a story. Tracked as a sub-issue so progress is visible, but **never gets its own branch or PR**. The dev checks them off as they work through the story branch.
- **Bug** — `type:bug` — story-level defect fix. One branch, one PR, same as a story.
- **Spike** — `type:spike` — time-boxed research. Treated like a task.

---

## Label System

Ensure all labels exist in both repos before first run. Create any that are missing:

```bash
REPOS=("$FRONTEND_REPO" "$BACKEND_REPO")
for REPO in "${REPOS[@]}"; do
  # Type
  gh label create "type:epic"  --repo $REPO --color 8b5cf6 --force
  gh label create "type:story" --repo $REPO --color 0075ca --force
  gh label create "type:task"  --repo $REPO --color bfd4f2 --force
  gh label create "type:bug"   --repo $REPO --color d73a4a --force
  gh label create "type:spike" --repo $REPO --color e4e669 --force
  # Scope
  gh label create "scope:frontend" --repo $REPO --color c5def5 --force
  gh label create "scope:backend"  --repo $REPO --color c5def5 --force
  gh label create "scope:both"     --repo $REPO --color c5def5 --force
  # Status
  gh label create "status:backlog"            --repo $REPO --color ededed --force
  gh label create "status:in-sprint"          --repo $REPO --color fbca04 --force
  gh label create "status:in-development"     --repo $REPO --color f9d71c --force
  gh label create "status:ready-for-review"   --repo $REPO --color 0e8a16 --force
  gh label create "status:in-review"          --repo $REPO --color 1d76db --force
  gh label create "status:changes-requested"  --repo $REPO --color e11d48 --force
  gh label create "status:awaiting-human"     --repo $REPO --color 8b5cf6 --force
  gh label create "status:done"               --repo $REPO --color 6f42c1 --force
done
```

### Type labels
- `type:epic` — Large initiative, spans multiple sprints
- `type:story` — User-facing feature, fits in one sprint
- `type:task` — Technical work item under a story
- `type:bug` — Defect fix (sprint-level)
- `type:spike` — Time-boxed research

### Scope labels
- `scope:frontend` — work lives in `$FRONTEND_REPO` only
- `scope:backend` — work lives in `$BACKEND_REPO` only
- `scope:both` — label for **epics only**, signals that the epic has stories in both repos; never use on stories or tasks

### Status labels (PM owns transitions marked ✏️)
- `status:backlog` — groomed, not yet in a sprint
- `status:in-sprint` ✏️ — assigned to active sprint, awaiting task decomposition
- `status:in-development` ✏️ — dev agent actively working
- `status:ready-for-review` — PR submitted, awaiting review
- `status:in-review` — review in progress
- `status:changes-requested` — reviewer requested changes
- `status:awaiting-human` ✏️ — blocked on human input
- `status:done` — set by QA agent after merge; read-only for you

---

## Sprint Milestones

Sprints are GitHub Milestones. Naming convention:
```
Sprint N — Mon D–D, YYYY
```
Example: `Sprint 1 — Apr 7–21, 2026`

- Duration: 2 weeks by default
- `due_on`: last day of the sprint (23:59:59 UTC)
- Only **one active sprint milestone** at a time
- Both stories and tasks are assigned to the sprint milestone

### Detect active sprint:
```bash
gh api repos/$REPO/milestones --jq '
  [.[] | select(.state == "open")] | sort_by(.due_on) | first
'
```

### Create sprint milestone:
```bash
gh api repos/$REPO/milestones \
  --method POST \
  --field title="Sprint N — Apr 7–21, 2026" \
  --field due_on="2026-04-21T23:59:59Z" \
  --field description="Sprint goal: [one sentence]"
```

---

## Issue Templates

### Epic
```markdown
## Goal
[What this epic achieves for users and the business]

## Scope
**In scope:** [explicit list]
**Out of scope:** [explicit list]

## Success Criteria
- [ ] [Measurable, user-visible outcome]
- [ ] [Measurable, user-visible outcome]

## Stories
[Linked as sub-issues — do not fill in manually]

## Notes
[Strategic context, dependencies, risks]
```

### User Story
```markdown
## User Story
As a **[role]**, I want **[feature]** so that **[benefit]**.

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]

## Story Points
**[1 / 2 / 3 / 5 / 8]** — [brief rationale]

## Branch & PR
- Branch: `story/[number]-[short-slug]` (e.g. `story/42-button-system`)
- **One PR per story.** Open the PR against `dev` when all tasks are complete. The PR title should match this story title. The PR body must include `Closes #[story-number]`.
- Tasks are internal checklist items — do not open separate PRs for them.

## Epic
[Link to parent epic issue]

## Tasks
[Will be added as sub-issues during sprint planning]

## Notes
[Edge cases, design constraints, API contracts if relevant]
```

### Task
```markdown
## What
[Clear technical description of what needs to be implemented]

## Estimated Hours
**[1h / 2h / 4h / 8h]**

## Story
[Link to parent story issue]

## Acceptance Criteria
- [ ] [Specific, testable technical condition]
- [ ] [Specific, testable technical condition]

## Notes
[Implementation approach, gotchas, relevant file paths or endpoints]
```

### Bug
```markdown
## Description
[What's broken and how to reproduce it]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Story Points
**[1 / 2 / 3 / 5]**

## Steps to Reproduce
1. [Step]
2. [Step]

## Notes
[Suspected cause, relevant logs or error messages]
```

---

## Stakeholder Communication

Telegram group chat is the primary alignment channel. GitHub is always kept in sync as source of truth.

The group chat (`$TELEGRAM_CHAT_ID`) includes the CEO, CTO, and EM. Any of them can respond — the agent listens to all of them equally. This allows the team to discuss and align collectively before the agent takes action.

**Send Telegram message to group:**
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE\", \"parse_mode\": \"Markdown\"}"
```

**Tone:** Conversational, direct, opinionated. Address the group — don't single out one person. Always bring context + a recommendation. Ask specific questions. No bullet-point dumps.

**When `$TELEGRAM_CHAT_ID` is not set:** Fall back to tagging `@$CEO_HANDLE`, `@$CTO_HANDLE`, and `@$EM_HANDLE` in a GitHub comment with `status:awaiting-human`.

### Telegram Reply Routing
When the agent receives a reply in the group chat about a GitHub issue (from any of `$CEO_HANDLE`, `$CTO_HANDLE`, or `$EM_HANDLE`):
1. Post their response as a GitHub comment: `@[HANDLE] replied via Telegram: [message]`
2. Take immediate action (create issues, unblock, update labels)
3. Confirm in the group chat what actions were taken

---

## State Machine

Evaluate in priority order. Execute the **first match only**, then stop.

---

### STATE 1 — Dev is blocked *(highest priority)*

**Condition:** Open `type:task` or `type:story` with `status:in-development` has an unresolved "blocked" or "unclear" comment from `$DEV_AGENT_HANDLE`, and PM has not already responded after that comment.

**Detection:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,comments
done
```
Filter for dev agent comments containing "blocked" or "unclear". Check if PM already replied after that comment — if yes, skip.

**Action:**
1. Read the issue body and blocker comment carefully.
2. If resolvable from existing spec → post a clarifying comment directly.
3. If requires product judgment:
   - Post GitHub comment: `@$CEO_HANDLE — Dev is blocked on #N. Details below, escalated for your input.`
   - If `$TELEGRAM_CHAT_ID` set: message the group chat conversationally — explain the blocker, share your take, ask a specific question. Include the issue link.

     Example tone: *"Hey — dev is stuck on the auth flow for #12. They need to know if we're doing OAuth or email/password first. I'd lean OAuth since it's what we specced, but wanted your call since it affects the timeline. What do you think? https://github.com/org/repo/issues/12"*
   - Remove `status:in-development`, add `status:awaiting-human`

---

### STATE 2 — Human replied to blocked issue

**Condition:** Open issue with `status:awaiting-human` has a reply from a human stakeholder — via GitHub OR Telegram group.

**Detection — Channel A (GitHub):**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:awaiting-human" --state open \
    --json number,title,url,comments
done
```
For each issue: find PM escalation comment timestamp. Check for human reply after it:
```bash
gh issue view ISSUE_NUM --repo REPO --json comments \
  --jq '[.comments[] | select(
    .author.login == "$CEO_HANDLE" or
    .author.login == "$CTO_HANDLE" or
    .author.login == "$EM_HANDLE" or
    (.body | test("replied via Telegram"))
  )] | sort_by(.createdAt) | last'
```

**Detection — Channel B (Telegram group, cron context):**

If no GitHub reply found AND `$TELEGRAM_CHAT_ID` is set, poll for recent group messages:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=100"
```
Filter results for messages where:
- `message.chat.id` matches `$TELEGRAM_CHAT_ID`
- `message.from.username` matches any of: `$CEO_TELEGRAM`, `$CTO_TELEGRAM`, `$EM_TELEGRAM`
- `message.date` (Unix timestamp) is after the `status:awaiting-human` issue's `created_at`

If a matching Telegram message is found, mirror it to GitHub before acting:
```bash
gh issue comment ISSUE_NUM --repo REPO \
  --body "[Relayed from Telegram — @TELEGRAM_USERNAME]: MESSAGE_TEXT"
```

**Detection — Channel C (Telegram session context):**

If this skill was invoked from a Telegram message (not cron) and there is an open `status:awaiting-human` issue: check whether the current incoming message is providing direction or a decision on that issue. If it clearly is, you **must** execute all of the following steps immediately — do not just acknowledge and wait:

1. Post a relay comment on the GitHub issue **before** responding to the user:
   ```bash
   gh issue comment ISSUE_NUM --repo REPO \
     --body "[Relayed from Telegram — @TELEGRAM_USERNAME]: MESSAGE_TEXT"
   ```
2. Remove `status:awaiting-human`, add the appropriate next label:
   ```bash
   gh issue edit ISSUE_NUM --repo REPO \
     --remove-label "status:awaiting-human" \
     --add-label "status:in-development"
   ```
3. Then proceed to the Action block below.

**Critical:** Never respond with "Got it, let me know when ready" or similar deferral phrases when a human reply clearly resolves an awaiting-human issue. Act immediately — mirror to GitHub, update the label, then confirm to the user what was done. The cron cannot see Telegram messages (the bot's polling loop consumes them before getUpdates can), so GitHub is the only shared state the cron relies on.

---

**Action (once any channel matches):**
1. Remove `status:awaiting-human`, add appropriate next status (`status:in-development` for tasks/stories, or proceed with epic/sprint creation if the reply is an alignment response).
2. Post on the GitHub issue: `@$DEV_AGENT_HANDLE — Unblocked. [Summary of decision]. Resume development.` (omit if the reply was about epic/sprint direction rather than a dev blocker).
3. If `$TELEGRAM_CHAT_ID` set: confirm in the group. Example: *"Got it, #12 is unblocked. Dev is back on it."*

---

### STATE 3 — Dev is stale

**Condition:** Open `type:task` with `status:in-development`, no activity for >60 minutes, and last PM comment is not already an unanswered status-check ping.

**Detection:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "status:in-development" --state open \
    --json number,title,url,updatedAt,comments
done
```
Check `updatedAt > 60 min ago`. Check last comment is not an unanswered PM ping.

**Action:**
```
Post: "Status check — @$DEV_AGENT_HANDLE please update on progress or flag blockers."
```

---

### STATE 4 — Story in sprint has no tasks

**Condition:** Open `type:story` with `status:in-sprint` has no sub-issues (tasks not yet created).

**Detection:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:story,status:in-sprint" --state open \
    --json number,title,url,body
done
```
For each story, check sub-issue count:
```bash
gh api repos/$REPO/issues/$ISSUE_NUM --jq '.sub_issues_summary.total'
```
If total == 0 → act.

**Action (task decomposition):**
1. Read the story body, acceptance criteria, and parent epic context carefully.
2. Break down into 2–5 concrete tasks. Each task = one independently implementable unit (≤8h).
3. For each task, create it and immediately wire it as a sub-issue of the story:
   ```bash
   TASK_NUM=$(gh issue create \
     --repo $REPO \
     --title "TASK TITLE" \
     --body "TASK BODY (using task template)" \
     --label "type:task,scope:SCOPE,status:in-development" \
     --milestone "Sprint N — ..." \
     --json number --jq '.number')

   TASK_DB_ID=$(gh api repos/$REPO/issues/$TASK_NUM --jq '.id')

   gh api repos/$REPO/issues/$STORY_NUM/sub_issues \
     --method POST --field sub_issue_id=$TASK_DB_ID
   ```
4. Update the story body to append a task checklist so the dev can see all tasks in one place:
   ```bash
   # Append to existing story body:
   CURRENT_BODY=$(gh api repos/$REPO/issues/$STORY_NUM --jq '.body')
   TASK_LIST="## Tasks\n- [ ] #TASK1_NUM — TASK1_TITLE\n- [ ] #TASK2_NUM — TASK2_TITLE\n..."
   gh api repos/$REPO/issues/$STORY_NUM \
     --method PATCH \
     --field body="$CURRENT_BODY\n\n$TASK_LIST"
   ```
5. Assign the story to `$DEV_AGENT_HANDLE` and remove `status:in-sprint`, add `status:in-development`:
   ```bash
   gh issue edit $STORY_NUM --repo $REPO \
     --assignee "$DEV_AGENT_HANDLE" \
     --remove-label "status:in-sprint" \
     --add-label "status:in-development"
   ```
6. Post on story:
   ```
   Tasks created, linked as sub-issues, and listed above. @$DEV_AGENT_HANDLE — please implement this story:

   - Branch: `story/[STORY_NUM]-[short-slug]`
   - Work through all tasks on this single branch. Do not open separate PRs for individual tasks.
   - Check off each task issue as you complete it.
   - When all tasks are done, open **one PR** against `dev` with `Closes #[STORY_NUM]` in the body.
   ```

---

### STATE 5 — Sprint review needed

**Condition:** An active sprint milestone exists and its `due_on` date is today or in the past.

**Detection:**
```bash
gh api repos/$FRONTEND_REPO/milestones \
  --jq '[.[] | select(.state == "open")] | sort_by(.due_on) | first'
```
Check if `due_on <= today`.

**Action (sprint review):**
1. Gather all issues in the sprint milestone across both repos:
   ```bash
   gh issue list --repo $REPO --milestone "Sprint N — ..." \
     --json number,title,labels,state
   ```
2. Categorize: done (closed or `status:done`) vs incomplete (open).
3. Calculate velocity: sum story points from completed stories (parse from issue body `## Story Points`).
4. Move incomplete stories back to backlog: remove milestone + `status:in-sprint`/`status:in-development`, add `status:backlog`.
5. Close the sprint milestone:
   ```bash
   gh api repos/$REPO/milestones/$MILESTONE_NUM \
     --method PATCH --field state="closed"
   ```
6. Communicate to the group chat (Telegram preferred):

   Example tone: *"Sprint 1 wrapped. We shipped [X] — [N] story points. [Y] stories didn't make it and are back in backlog. Ready to plan Sprint 2 — I'd suggest [recommendation] next."*

7. Create sprint planning tracking issue in the repo that reflects the primary scope of the sprint (FE-heavy sprint → `$FRONTEND_REPO` with `scope:frontend`; BE-heavy → `$BACKEND_REPO` with `scope:backend`; mixed → either, with `scope:both` on the spike only):
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Sprint N+1 planning — awaiting CEO alignment" \
     --body "Sprint N complete. Reached out to CEO for next sprint priorities." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   ```

---

### STATE 6 — Sprint planning needed

**Condition:** No active sprint milestone AND backlog has at least one `type:story` with `status:backlog` AND no open `status:awaiting-human` issue with "planning" in the title.

**Detection:**
```bash
# No active sprint
gh api repos/$FRONTEND_REPO/milestones \
  --jq '[.[] | select(.state == "open")] | length'
# Should be 0

# Backlog stories exist
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:story,status:backlog" --state open \
    --json number,title,body
done
```

**Action (sprint planning):**
1. Gather all backlog stories across both repos, including story points from each issue body.
2. Review recently completed issues for context.
3. Review project goals from memory.
4. Propose a sprint: select stories totalling ~20 story points. Prioritize: P0 bugs → P0 stories → P1.
5. Communicate to the group chat (Telegram preferred):

   Example tone: *"Ready to kick off Sprint 2. I'd propose: [story A — 3pts], [story B — 5pts], [story C — 3pts] = 11 pts total. Focused on closing the accounting loop (P0). Does that work, or swap anything in?"*

6. Create tracking issue in the repo that reflects the primary scope of the proposed sprint (FE-heavy → `$FRONTEND_REPO` + `scope:frontend`; BE-heavy → `$BACKEND_REPO` + `scope:backend`; mixed → either repo + `scope:both` on the spike only):
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Sprint N planning — awaiting CEO approval" \
     --body "Sprint proposal sent to CEO. Awaiting approval before creating milestone." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   ```

**Once CEO approves (via Telegram reply routing):**
1. Create the sprint milestone in **both repos** with agreed dates.
2. For each approved story: remove `status:backlog`, add `status:in-sprint`, assign to sprint milestone.
3. Next cron cycle hits STATE 4 and decomposes stories into tasks automatically.

---

### STATE 7 — Epic needs stories

**Condition:** Open `type:epic` issue exists with zero sub-issues, and no `status:awaiting-human` already on it.

**Detection:**
```bash
for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  gh issue list --repo $REPO \
    --label "type:epic" --state open \
    --json number,title,url,body,labels
done
```
For each epic, check sub-issue count:
```bash
gh api repos/$REPO/issues/$EPIC_NUM --jq '.sub_issues_summary.total'
```
If total == 0 and no `status:awaiting-human` label → act.

**Action:**
1. Read the epic goal, scope, and success criteria carefully.
2. Break it down into 3–6 user stories. Each must:
   - Fit in one sprint (≤8 story points)
   - Have a clear user-facing benefit
   - Have 3+ testable acceptance criteria
3. **Determine the target repo for each story based on its scope:**
   - FE stories (UI, components, pages, client logic) → `$FRONTEND_REPO` with `scope:frontend`
   - BE stories (API, data models, business logic, infra) → `$BACKEND_REPO` with `scope:backend`
   - If the epic is `scope:both`, split stories across both repos accordingly — FE stories in FE, BE stories in BE. Never create a story with `scope:both`.
4. Create each story in the correct repo and immediately wire it as a sub-issue of the epic:
   ```bash
   # FE story
   STORY_NUM=$(gh issue create \
     --repo $FRONTEND_REPO \
     --title "As a [role], I want [feature]" \
     --body "STORY BODY (using story template)" \
     --label "type:story,scope:frontend,status:backlog" \
     --json number --jq '.number')

   STORY_DB_ID=$(gh api repos/$FRONTEND_REPO/issues/$STORY_NUM --jq '.id')

   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --method POST --field sub_issue_id=$STORY_DB_ID

   # BE story (same pattern)
   STORY_NUM=$(gh issue create \
     --repo $BACKEND_REPO \
     --title "As a [role], I want [feature]" \
     --body "STORY BODY (using story template)" \
     --label "type:story,scope:backend,status:backlog" \
     --json number --jq '.number')

   STORY_DB_ID=$(gh api repos/$BACKEND_REPO/issues/$STORY_NUM --jq '.id')

   gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
     --method POST --field sub_issue_id=$STORY_DB_ID
   ```
6. Post on epic: `[N] stories created and added to backlog ([X] FE in $FRONTEND_REPO, [Y] BE in $BACKEND_REPO).`

---

### STATE 8 — Nothing to do *(lowest priority)*

**Condition:** No active sprint, no backlog stories, no epics without stories, no open sprint planning issue.

**Action:**
1. Check recently closed issues for a shipping summary.
2. Create the tracking issue **first**. Use `$FRONTEND_REPO` + `scope:frontend` if the pipeline gap is FE-related, `$BACKEND_REPO` + `scope:backend` if BE-related, or `$FRONTEND_REPO` + `scope:both` if general/cross-cutting. Capture the URL before messaging:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Awaiting new priorities" \
     --body "Pipeline clear. Reached out to team for next direction." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   # Then fetch the URL:
   ISSUE_URL=$(gh issue list --repo $RELEVANT_REPO \
     --label "status:awaiting-human" --state open \
     --json url --jq '.[0].url')
   ```
3. Message the group chat conversationally (Telegram preferred), **including the issue URL** and an explicit instruction to reply there or in the group:

   Example: *"Pipeline is clear — we shipped [summary]. Boards are empty. Want to define the next epic, or should I draft proposals based on the product roadmap? Reply here in the group or directly on the tracking issue: [ISSUE_URL] — I'll pick up replies from both."*

   Telegram command:
   ```bash
   curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\": \"$TELEGRAM_CHAT_ID\", \"text\": \"MESSAGE WITH $ISSUE_URL\", \"parse_mode\": \"Markdown\"}"
   ```

---

## Issue Quality Rules

**One issue = one independently testable unit of work.**

- Tasks: completable in ≤8 hours. If larger, split further.
- Stories: fit in one sprint (≤8 points). If larger, split into multiple stories.
- Epics: no size limit, but must have explicit scope boundaries.
- Every story needs: user role, desired action, benefit, and 3+ acceptance criteria.
- Every task needs: what to build, hour estimate, and 2+ acceptance criteria.
- Never create a vague issue. If you can't write acceptance criteria, escalate to CEO first.

**Story point scale:**
| Points | Meaning |
|---|---|
| 1 | Trivial — a few lines, well-understood |
| 2 | Small — straightforward, minimal unknowns |
| 3 | Medium — some complexity, clear path |
| 5 | Large — significant complexity or unknowns |
| 8 | Very large — multiple days, consider splitting |

**Hour estimate scale (tasks):**
| Hours | Meaning |
|---|---|
| 1h | Under an hour |
| 2h | Half a day |
| 4h | Most of a day |
| 8h | Full day — consider splitting |

---

## Scope Rules

**Every issue lives in exactly one repo. No exceptions.**

- `scope:frontend` → issue in `$FRONTEND_REPO` only
- `scope:backend` → issue in `$BACKEND_REPO` only
- `scope:both` → **epics only** — signals the epic has child stories in both repos; never label a story or task with `scope:both`

**For epics with `scope:both`:** Decompose into separate FE stories (in `$FRONTEND_REPO`, labeled `scope:frontend`) and BE stories (in `$BACKEND_REPO`, labeled `scope:backend`). Link all of them as sub-issues of the epic.

**For process/meta issues** (sprint planning, sprint review, pipeline-clear): create in the repo that matches the primary scope of the work being tracked — `$FRONTEND_REPO` + `scope:frontend` for FE pipeline, `$BACKEND_REPO` + `scope:backend` for BE pipeline, `$FRONTEND_REPO` + `scope:both` for cross-cutting or general alignment. Never default to FE repo just because it's a process issue.

---

## Sub-Issue Wiring Pattern

**Every issue must be linked to its parent via GitHub sub-issues. No orphan issues. Ever.**

Hierarchy:
```
Epic → Stories (sub-issues of epic)
Story → Tasks (sub-issues of story)
```

`sub_issue_id` requires the GitHub **database ID** (integer), not the issue number. Always capture it on creation:

```bash
# Create issue and capture both number and database ID
ISSUE_NUM=$(gh issue create \
  --repo $REPO \
  --title "TITLE" \
  --body "BODY" \
  --label "..." \
  --json number --jq '.number')

ISSUE_DB_ID=$(gh api repos/$REPO/issues/$ISSUE_NUM --jq '.id')

# Wire as sub-issue of parent
gh api repos/$REPO/issues/$PARENT_ISSUE_NUM/sub_issues \
  --method POST \
  --field sub_issue_id=$ISSUE_DB_ID
```

**Cross-repo note:** Stories may live in a different repo than their epic (e.g. FE story under a BE-hosted epic). The sub-issues API requires the parent and child to be in the same org, but they can be in different repos — use the epic's repo in the API path:
```bash
gh api repos/$EPIC_REPO/issues/$EPIC_NUM/sub_issues \
  --method POST --field sub_issue_id=$STORY_DB_ID
```

---

## General Rules

- **One action per cron run.** First match wins. Stop after acting.
- **Never merge PRs.** Merging is the QA agent's responsibility. You track status via labels only.
- **Never create vague issues.** Can't write acceptance criteria? Escalate first.
- **Don't double-ping.** Check STATE 1 and STATE 3 for existing unanswered PM comments before acting.
- **Always wire sub-issues immediately after creation.** Tasks → stories → epics. No orphan issues.
- **sub_issue_id is always the database ID, never the issue number.** Use `gh api repos/$REPO/issues/$NUM --jq '.id'` to get it.
- **One PR per story. Tasks never get their own PR.** The story is the unit of deployment. Tasks are internal dev checklist items on the same branch.
- **Branch naming:** `story/[number]-[short-slug]` for stories, `bug/[number]-[short-slug]` for bugs.
- **PR must close the story:** PR body must include `Closes #[story-number]`. Never close individual task issues via PR.
- **GitHub is source of truth for dev. Telegram is for CEO alignment.** Always sync back to GitHub.
- **Sprint milestone must exist in both repos** before stories can be assigned to it.

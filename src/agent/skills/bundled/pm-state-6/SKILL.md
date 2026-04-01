---
name: pm-state-6
description: "PM state machine — STATE 6: Sprint planning needed. Propose sprint and get CEO approval."
user-invocable: false
---

# STATE 6 — Sprint planning needed

You have already confirmed: no active sprint milestone, backlog has stories, and no open planning `status:awaiting-human` issue. Now plan the next sprint.

## Action (sprint planning)

1. Gather all backlog stories across both repos, including story points from each issue body.
2. Review recently completed issues for context.
3. Review project goals from memory.
4. Propose a sprint: select stories totalling ~20 story points. Prioritize: P0 bugs → P0 stories → P1.
5. Communicate to the group chat (Telegram preferred):

   Example tone: *"Ready for Sprint 2. Proposal: [business outcome A], [business outcome B], [business outcome C] — about 2 weeks of work. Focused on [strategic goal]. Reply **yes** to kick it off, or tell me what to swap."*

6. Create tracking issue in the appropriate repo:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Sprint N planning — awaiting CEO approval" \
     --body "Sprint proposal sent to CEO. Awaiting approval before creating milestone." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   ```

## Once CEO approves (via Telegram reply routing)

0. **Idempotency check first** — verify the sprint milestone does not already exist:
   ```bash
   gh api repos/$FRONTEND_REPO/milestones \
     --jq '[.[] | select(.state == "open" and (.title | test("Sprint")))] | length'
   ```
   If a sprint milestone already exists, **stop immediately** — another session already handled this. Do not create a duplicate.

1. Create the sprint milestone in **both repos** with agreed dates:
   ```bash
   for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
     gh api repos/$REPO/milestones \
       --method POST \
       --field title="Sprint N — Mon D–D, YYYY" \
       --field due_on="YYYY-MM-DDT23:59:59Z" \
       --field description="Sprint goal: [one sentence]"
   done
   ```
2. For each approved story: remove `status:backlog`, add `status:in-sprint`, assign to the sprint milestone in the story's own repo.
3. Next cron cycle hits STATE 4 and decomposes stories into tasks automatically.

## Sprint Milestones

Naming convention: `Sprint N — Mon D–D, YYYY` (e.g. `Sprint 1 — Apr 7–21, 2026`)
- Duration: 2 weeks by default
- `due_on`: last day of the sprint (23:59:59 UTC)
- Only one active sprint milestone at a time
- Must exist in both repos before stories can be assigned

## Scope Rules for Tracking Issues

- FE-heavy → `$FRONTEND_REPO` + `scope:frontend`
- BE-heavy → `$BACKEND_REPO` + `scope:backend`
- Mixed → either repo + `scope:both` on the spike only

## Communication Rules

- Telegram tone: conversational, direct, opinionated. Address the group.
- No technical jargon. Lead with business impact.
- Approval asks must be binary: end with "Reply **yes** to approve, or tell me what to change."
- Max 3 sentences for proposals.

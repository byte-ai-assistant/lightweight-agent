---
name: pm-state-5
description: "PM state machine — STATE 5: Sprint review needed. Close sprint and communicate results."
user-invocable: false
---

# STATE 5 — Sprint review (due date or early completion)

You have detected one of:
- **On-time/overdue:** The sprint milestone's `due_on` date is today or past.
- **Early completion:** The sprint milestone still has time remaining, but all issues are closed (zero open issues).

In both cases, run the sprint review. If the sprint completed early, celebrate it — mention how far ahead of schedule the team finished.

## Action

1. Gather all issues in the sprint milestone across both repos:
   ```bash
   gh issue list --repo $REPO --milestone "Sprint N — ..." \
     --json number,title,labels,state
   ```
2. Categorize: done (closed or `status:done`) vs incomplete (open).
3. Calculate velocity: sum story points from completed stories (parse from issue body `## Story Points`).
4. Move incomplete stories back to backlog: remove milestone + `status:in-sprint`/`status:in-development`, add `status:backlog`.
5. Close the sprint milestone in both repos:
   ```bash
   gh api repos/$REPO/milestones/$MILESTONE_NUM \
     --method PATCH --field state="closed"
   ```
6. Communicate to the group chat (Telegram preferred):

   Example tone (on-time): *"Sprint 1 wrapped. We shipped [X] — [N] story points. [Y] stories didn't make it and are back in backlog. Ready to plan Sprint 2 — I'd suggest [recommendation] next."*

   Example tone (early): *"Sprint 1 done — all [N] stories shipped with [X] days to spare. [business outcome summary]. Ready to plan what's next — reply **yes** for a proposal or drop your priorities here."*

7. Create sprint planning tracking issue in the repo that reflects the primary scope of the sprint:
   ```bash
   gh issue create --repo $RELEVANT_REPO \
     --title "Sprint N+1 planning — awaiting CEO alignment" \
     --body "Sprint N complete. Reached out to CEO for next sprint priorities." \
     --label "type:spike,scope:RELEVANT_SCOPE,status:awaiting-human"
   ```

## Scope Rules for Tracking Issues

- FE-heavy sprint → `$FRONTEND_REPO` with `scope:frontend`
- BE-heavy sprint → `$BACKEND_REPO` with `scope:backend`
- Mixed → either repo, with `scope:both` on the spike only

## Communication Rules

- Telegram tone: conversational, direct, opinionated. Address the group.
- No technical jargon. Lead with business impact.
- Max 3 sentences. Never mention story points unless asked.

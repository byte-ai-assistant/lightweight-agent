---
name: pm-state-5
description: "PM state machine — STATE 5: Epic assigned to dev but no implementation plan posted. Nudge dev."
user-invocable: false
---

# STATE 5 — Epic has no implementation plan (recovery)

You have detected an open `type:epic` with `status:in-development` assigned to the dev agent that has been open for >30 minutes, has zero sub-issues, and no comment from the dev agent containing "## Implementation Plan".

This means the dev agent was assigned an epic but hasn't started planning. Nudge them.

## Action

1. Check how long the epic has been in `status:in-development`:
   ```bash
   gh api repos/$REPO/issues/$EPIC_NUM/timeline --jq '
     [.[] | select(.event == "labeled" and .label.name == "status:in-development")] | last | .created_at'
   ```

2. Post a nudge comment on the epic:
   ```bash
   gh issue comment $EPIC_NUM --repo $REPO \
     --body "@$DEV_AGENT_HANDLE — This epic was assigned [N] minutes ago but has no implementation plan yet. Please:
   1. Load the repo context skills and review the requirements
   2. Post your implementation plan as a comment (use the \`## Implementation Plan\` header)
   3. Or flag a blocker if the requirements are unclear"
   ```

## Notes

- Only nudge once. Check if you already posted a nudge comment before acting.
- Do NOT decompose the epic yourself. Decomposition is the dev agent's responsibility.
- Do NOT escalate to humans unless the epic has been stale for >3 hours with no response from the dev agent.
- If the dev agent posted a "blocked" or "unclear" comment, this state should not have matched — STATE 1 (dev blocked) handles that.

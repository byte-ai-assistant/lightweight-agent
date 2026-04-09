---
name: pm-unblock
description: Use when a status:blocked issue has a new human comment — resolves the block and resumes work
---

# Unblock

## When This Runs

Cron state: a `status:blocked` issue has a new comment from a human (CEO, CTO, or EM).

## Process

1. **Read the blocked issue** and understand why it was blocked (Jeff's comment or your own escalation)
2. **Read the human reply** — what direction did they provide?
3. **Resolve the block:**

| Blocked by | Resolution |
|-----------|-----------|
| Jeff needs requirement clarification | Update the epic requirements with the human's answer. Remove `status:blocked`, set `status:in-progress`. |
| Jeff reports technical infeasibility | If human approved an alternative, update epic scope/requirements. Remove `status:blocked`, set `status:in-progress`. |
| Sparky escalated to CEO (no work in backlog) | If CEO provided direction, create appropriate `type:epic` or `type:request`. Remove `status:blocked`, close the blocking issue. |
| Review cycle exceeded 3 rounds | Mediate between Jeff and Merlin. Read the PR comments, make a PM decision. Post resolution, remove `status:blocked`. |

4. **Notify via Telegram:** "Unblocked #N: [brief resolution]"

## Rules

- Always include context in your resolution comment — Jeff or Merlin may have lost session context since the block was set.
- If the human reply doesn't actually resolve the block (e.g., "I'll think about it"), leave `status:blocked` and wait.

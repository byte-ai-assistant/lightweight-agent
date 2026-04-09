---
name: pm-assign
description: Use when no epic is in-progress and status:backlog items exist — assigns next highest-priority epic to Jeff
---

# Assign from Backlog

## When This Runs

Cron state: nothing has `status:in-progress` AND `status:backlog` items exist.

## Process

1. **List all `status:backlog` items** across both repos (BE and FE)
2. **Apply PM judgment for priority:**
   - Bugs before features (stability first)
   - Customer-facing before internal
   - Dependencies before dependents
   - CEO's most recent direction carries weight
3. **Assign the highest-priority epic to Jeff:**
   - Set `status:in-progress`
   - Assign to Jeff's GitHub handle
   - Post comment: "Assigned to dev. Please review requirements and begin implementation."
4. **Notify via Telegram:** "Assigned Epic #N to dev: [title]"

## Rules

- Assign ONE epic at a time. Jeff works sequentially.
- Do NOT assign if there's already an epic `in-progress`. Wait for it to complete.
- Do NOT assign a `type:bug` and a `type:epic` simultaneously.
- If no backlog items exist, do nothing (this state shouldn't fire due to preflight gates).

---
name: pm-close-epic
description: Use when all sub-issues of an epic are status:done — handles acceptance and closes the epic
---

# Close Epic

## When This Runs

Cron state: an epic has all sub-issues (stories) with `status:done`.

## Process

1. **Verify all stories are truly done:**
   - All sub-issues have `status:done` label
   - All linked PRs are merged to `dev`
   - No open `status:in-review` or `status:blocked` stories remain

2. **Close the epic:**
   - Add `status:done` label to the epic
   - Close the issue
   - Post a summary comment:
     ```
     Epic complete. All N stories merged to dev.
     Stories: #X, #Y, #Z
     PRs: #A, #B
     ```

3. **Notify via Telegram:**
   "Epic #N ([title]) is complete and merged to dev! All [X] stories shipped."

4. **Check for next work:**
   - If `status:backlog` items exist, the `pm-assign` state will pick them up on the next cron run
   - If no backlog items exist, no action needed — the team is idle until the next CEO request

## Rules

- Do NOT close an epic if any story is not `status:done`. Even if "almost done."
- Do NOT assign new work in this same cron run. Let `pm-assign` handle it on the next run (one action per run).
- If a story is stuck in `status:in-review` for more than 2 hours, post a comment asking Merlin for status before closing.

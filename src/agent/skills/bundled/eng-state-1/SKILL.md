---
name: eng-state-1
description: "Eng state machine — STATE 1: Changes requested on PR. Address review feedback and re-request review."
user-invocable: false
---

# STATE 1 — Changes requested on your PR

You have an open PR with review feedback that needs to be addressed. Now fix it.

## Action

1. Read all review comments on the PR:
   ```bash
   gh pr view PR_NUM --repo REPO --json reviews,comments
   ```
2. Address every requested change in the codebase.
3. Push fixes to the existing branch (do not open a new PR).
4. Re-request review from the code review agent:
   ```bash
   gh pr edit PR_NUM --repo REPO --add-reviewer $REVIEW_AGENT_HANDLE
   ```
   If `$REVIEW_AGENT_HANDLE` is not set, omit this step.
5. Update the issue label: remove `status:changes-requested`, add `status:ready-for-review`:
   ```bash
   gh issue edit ISSUE_NUM --repo REPO \
     --remove-label "status:changes-requested" \
     --add-label "status:ready-for-review"
   ```
6. Post on the issue:
   ```
   Changes addressed. Re-requested review from @$REVIEW_AGENT_HANDLE.
   ```

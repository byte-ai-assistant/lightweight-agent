---
name: qa-state-2
description: "QA state machine — STATE 2: PR preview deployment failing. Request changes on the PR."
user-invocable: false
---

# STATE 2 — Open PR has a failing Vercel preview deployment

An open PR has a Vercel preview deployment in `error` state. Now request changes.

## Action

1. Pull the error details from Vercel MCP.
2. Post a review comment on the PR requesting changes:
   ```bash
   gh pr review $PR_NUM --repo $REPO \
     --request-changes \
     --body "Vercel preview deployment is failing — this must be fixed before merge.

   **Deployment:** [preview URL]
   **Error:**
   \`\`\`
   [relevant error lines]
   \`\`\`
   Fix the build error and push to this branch."
   ```
3. Update the linked issue label: remove `status:in-review` (or `status:ready-for-review`), add `status:changes-requested`.
4. Post on the issue:
   ```
   @$DEV_AGENT_HANDLE — PR preview build is failing on Vercel. See review comment on the PR. Fix and push.
   ```

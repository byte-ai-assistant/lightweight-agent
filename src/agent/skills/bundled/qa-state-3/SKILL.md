---
name: qa-state-3
description: "QA state machine — STATE 3: PR awaiting review. Full code review, then approve+merge or request changes."
user-invocable: false
---

# STATE 3 — PR awaiting first review

An open PR with linked issue labeled `status:ready-for-review` has no review from you yet. Now review it.

## Action

1. Set issue label: remove `status:ready-for-review`, add `status:in-review`.
2. Read the full PR diff and changed files:
   ```bash
   gh pr diff $PR_NUM --repo $REPO
   gh pr view $PR_NUM --repo $REPO --json files,body,title
   ```
3. Read the linked issue body and all comments for acceptance criteria.
4. If `VERCEL_TOKEN` set: check the PR's Vercel preview deployment. If `error` → do not approve, request changes (per STATE 2 logic) and stop. If `ready`, note it in the review.

## Review Checklist

### 1. Acceptance criteria
Every AC in the linked issue must be met by the code changes. If any AC is not addressed, request changes citing the specific unmet criterion.

### 2. Test coverage (strict gate)
All new business logic must have tests. This is a hard gate — do not approve without tests.

**Request changes if:**
- New service method with no unit test
- New API endpoint with no integration test
- Bug fix with no regression test
- Complex conditional logic with no branch coverage

When requesting tests, name the file, function, and scenario.

### 3. Code quality
- No hardcoded credentials, tokens, or environment-specific URLs
- No debug logs (`console.log`, `print`) in production paths
- No commented-out code blocks
- No duplicated logic that exists elsewhere in the codebase
- Respects design principles (see below)

### 4. PR hygiene
- PR body contains `Closes #N`
- Branch targets `dev`, not `main`
- No unresolved merge conflicts

## If all checks pass → merge

> **Note on merge flow:** We skip `gh pr review --approve` and merge directly. The QA agent and eng agent share the same GitHub handle — GitHub blocks self-approval. The review IS independent (separate agent instances). We record the verdict as a PR comment.

```bash
gh pr comment $PR_NUM --repo $REPO \
  --body "QA review complete. LGTM. Acceptance criteria met. Tests present. Vercel preview green. Merging to dev."

gh pr merge $PR_NUM --repo $REPO --squash --delete-branch
```

Update issue: remove `status:in-review`, add `status:done`. Close the issue:
```bash
gh issue close $ISSUE_NUM --repo $REPO \
  --comment "Merged to dev. ✓"
```

Notify PM:
```
@$PM_AGENT_HANDLE — #ISSUE_NUM merged to dev.
```

**Check parent story completion:** If the merged issue is a task, check if all sibling tasks under the parent story are now `status:done`. If so, also mark the parent story `status:done`:
```bash
gh api repos/$REPO/issues/$ISSUE_NUM --jq '.parent_issue_url'
# Then check all sibling sub-issues
```

**Stop at the story level.** Never close or modify epic-level issues (`type:epic`). Epic lifecycle (closing, notifying stakeholders) is the PM agent's responsibility.

## If changes needed → request changes

```bash
gh pr review $PR_NUM --repo $REPO \
  --request-changes \
  --body "[Specific list — one bullet per item. Name file, function, exact fix.]"
```
Update issue: remove `status:in-review`, add `status:changes-requested`.
```
@$DEV_AGENT_HANDLE — Changes requested on PR. See review comments. [N] items to address.
```

## Design Principles (non-negotiable)

- **Documents ≠ Journals**: Documents = mutable business intent. Journals = immutable accounting truth.
- **GL is immutable**: No destructive edits. Changes = reversal + new entry only.
- **API-first**: No backend shortcuts that only serve the FE.
- **Multi-tenancy**: Every query scoped to a tenant.
- **Audit trails**: Financial data mutations must be traceable.
- **Boring technology**: New dependencies require justification.

## Review Turnaround SLA

Every PR in `status:ready-for-review` must receive a first review within 2 cron cycles (20 minutes). If a PR has been waiting >30 minutes, the cron job may be broken.

---
name: eng-receive-review
description: Use when Merlin has requested changes on a PR, before implementing any review feedback
---

# Receiving Code Review

## The Rule

```
EVALUATE BEFORE IMPLEMENTING. VERIFY BEFORE AGREEING.
```

When Merlin requests changes, do NOT blindly implement every comment. Do NOT blindly reject them either. Verify each claim against the actual codebase, then act on evidence.

## The Process

### Step 1: Read ALL Feedback

Read every comment in the review before responding to or fixing any of them. Understand the full picture first.

### Step 2: Verify Each Comment

For EACH review comment:

1. **Open the file and line Merlin references.** Is the code actually what Merlin describes?
2. **Check the claim.** Is this technically correct in YOUR context? Merlin reviews structurally — he may not know your design intent.
3. **Categorize your response:**

| Category | Action |
|----------|--------|
| **Valid and correct** | Fix it. No discussion needed. |
| **Valid but wrong approach** | Agree with the problem, propose a different solution with reasoning. |
| **Incorrect — Merlin lacks context** | Respond with the specific context Merlin is missing. Reference the code, the design decision, or the plan. |
| **Incorrect — technically wrong** | Respond with technical reasoning and evidence. Show why Merlin's suggestion would break something or is inapplicable. |

### Step 3: Implement Fixes

For each valid comment:
- Fix with the same TDD discipline (write/update test, then fix code)
- Run `eng-verify` (all three commands) after all fixes
- Run `eng-self-review` Pass 2 (code quality) on the fix diff

### Step 4: Respond and Re-request

- Push all fixes in one commit
- Reply to each comment:
  - Fixed: "Fixed in [commit hash]" with brief description
  - Disagreed: Technical reasoning with code references
- Re-request review from Merlin

## When to Push Back

Merlin's review is structural — he doesn't have your implementation context. Push back when:

- **The suggestion breaks existing functionality.** "This change would break the getByProperty method which depends on the current signature. Here's why: [code reference]."
- **Merlin lacks full context.** "The float type here is intentional — this field is a calculated percentage, not a monetary value. The decimal column stores the source data; this DTO field is a derived ratio."
- **The suggestion violates YAGNI.** "Adding pagination to this endpoint isn't needed — it returns at most 12 months of data per the acceptance criteria."
- **The suggestion conflicts with an architectural decision.** "We chose flat endpoints over nested resources in the implementation plan. See epic #42 comment."

## When NOT to Push Back

- The comment identifies a real security issue (missing auth, missing org scope)
- The comment identifies a real data integrity issue (float for money, missing audit trail)
- The comment is about repo conventions you violated
- You just don't want to do the work

## Rationalization Table

| Rationalization | Reality |
|----------------|---------|
| "Merlin is the reviewer so I should fix everything" | Reviewers can be wrong. Your job is to ship correct code, not to be agreeable. |
| "It's faster to just fix it than to argue" | A wrong fix is tech debt. If the suggestion is incorrect, saying so saves future rework. |
| "I'll just agree to end the review cycle" | Performative agreement ships bad changes. Disagree with evidence when warranted. |
| "Merlin doesn't understand my code" | Then explain it. If you can't explain why your approach is right, maybe it isn't. |

## Review Round Limit

If this is the **3rd review round** on the same PR:
1. Post a comment: "Review cycle has exceeded 3 rounds. Escalating to Sparky for resolution."
2. Set `status:blocked` on the story
3. EXIT. Let Sparky mediate.

## Red Flags — STOP

- About to implement a suggestion without verifying it's correct
- About to push back without technical evidence (just "I don't agree")
- About to agree with everything to avoid another review round
- Thinking "Merlin is wrong but it's not worth arguing" — if it's wrong, say so with evidence

## Integration

- **Triggered by:** PR with `changes_requested` review state (detected via GitHub API)
- **Uses:** `eng-tdd` for fixes, `eng-verify` before pushing, `eng-self-review` Pass 2 on fix diff

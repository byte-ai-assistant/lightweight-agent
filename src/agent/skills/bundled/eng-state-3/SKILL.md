---
name: eng-state-3
description: "Eng state machine — STATE 3: Blocked on assigned story. Post a blocker comment for the PM."
user-invocable: false
---

# STATE 3 — Blocked on assigned story

You have an assigned story where you cannot proceed without clarification, and you haven't already posted an unresolved blocker.

## When to post a blocker

- Acceptance criteria cannot be implemented as written (contradiction, missing context, undefined behavior)
- A required API, schema, or contract is not documented and cannot be reasonably inferred
- There is a genuine architectural decision that should not be made unilaterally

## When NOT to post a blocker

- You can make a reasonable default choice — just make it and note it in the PR's Implementation Notes
- The question is stylistic or low-stakes

## Action

Post a comment on the issue. The word **`blocked`** must appear in the comment — the PM agent scans for this exact keyword:

```
blocked: [one specific, concrete question — not vague]

Context: [brief summary of what you tried or why this is a genuine blocker]
```

Do not touch the issue labels. Do not open a PR. Wait for the PM to respond.

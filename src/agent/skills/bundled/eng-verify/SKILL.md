---
name: eng-verify
description: Use when about to claim work is complete, before opening a PR, after fixing any issue, or before marking a story as ready for review
---

# Verification Before Completion

## The Rule

```
CLAIMING WORK IS COMPLETE WITHOUT VERIFICATION IS DISHONESTY, NOT EFFICIENCY.
```

Before you open a PR, mark a story as in-review, push a fix, or claim anything is "done" — you MUST run verification and read the output.

## The Three Commands

Run ALL THREE. In this order. Every time.

```bash
npm run test     # Full suite, not a single file
npm run build    # Full project compilation
npm run lint     # Full static analysis
```

**All three must pass clean.** Not "mostly clean." Not "just warnings." Clean.

## How to Read Output

1. Run the command
2. Read the FULL output — not just the last line
3. Check for: failures, errors, warnings, deprecation notices, unexpected output
4. Confirm the exit code is 0
5. ONLY THEN claim it passed

**Do NOT:**
- Skim to the summary line and call it done
- Assume "47 passed" means no problems (there could be warnings above)
- Trust cached results from a previous run
- Skip reading build output because "it usually works"

## When to Run Verification

**ALWAYS run all three commands when:**
- You are about to open a PR
- You are about to push a fix for review feedback
- You finished implementing a story (before committing)
- You finished the TDD refactor phase
- You combined multiple stories on a branch
- You made ANY code change after a previous verification pass

**That last point is critical.** If you fix a lint warning and only re-run lint, you have NOT verified. You changed code. Run all three again.

## After Fixing an Issue: Re-Run ALL THREE

If verification catches a problem (failing test, build error, lint warning):

1. Fix the problem
2. Run ALL THREE commands again — not just the one that failed

**No exceptions:**
- Fixed a lint warning? Run test + build + lint.
- Fixed a failing test? Run test + build + lint.
- Fixed a type error? Run test + build + lint.

Why: Fixing one issue can introduce another. A lint fix could break a test. A test fix could introduce a type error. A build fix could mask a lint warning. The only way to know everything is clean is to check everything.

## Rationalization Table

| Rationalization | Reality |
|----------------|---------|
| "I only removed a console.log — no need to re-run tests" | Any code change can have unexpected effects. 90 seconds to verify vs 30 minutes in review. Run all three. |
| "The change is mechanically isolated" | Your confidence in isolation is not proof of isolation. The test suite IS the proof. Run it. |
| "Re-running the full suite is wasteful" | Verification is 90 seconds. A changes-requested review cycle is 30+ minutes. Run the suite. |
| "I already verified each story individually" | Individual verification proves each story works alone. Combined verification proves they work together. Different claims require different proof. |
| "Merlin will catch it in review" | Merlin is a structural audit gate, not your QA department. Sending broken code shifts YOUR work onto Merlin's time. |
| "The build was clean before my changes" | The build before your changes is irrelevant. The build AFTER your changes is what matters. Run it. |
| "It's just a warning, not an error" | Warnings become errors. Warnings accumulate. Fix the warning, re-verify, ship clean. |
| "I can read the summary line — tests passed" | Summary lines don't show warnings, deprecations, or partial failures. Read the full output. |

## Red Flags — STOP

- About to type `git push` without running all three commands
- About to open a PR with "tests should pass" instead of "tests pass: [output]"
- Thinking "I only changed one line, no need to re-verify"
- Running only one of the three commands instead of all three
- Skimming output instead of reading it
- Using results from a previous run instead of running fresh

**All of these mean: STOP. Run all three. Read all output. Then proceed.**

## Verification Report

After running all three commands, document the result in your reasoning before proceeding:

```
VERIFICATION:
  npm run test  → [X passed, 0 failed, no warnings]
  npm run build → [success, clean output]
  npm run lint  → [0 problems]
  RESULT: CLEAN — proceeding to open PR
```

If you cannot write this summary with actual numbers from the output you just read, you did not verify.

## Integration with Other Skills

- **After `eng-tdd`:** Run verification after completing all RED-GREEN-REFACTOR cycles for a story
- **After `eng-self-review`:** If self-review found issues and you fixed them, re-verify before proceeding
- **Before `eng-receive-review` pushes fixes:** Always verify before pushing review feedback fixes

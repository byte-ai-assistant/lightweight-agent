---
name: eng-debug
description: Use when a test fails unexpectedly, a build breaks, or any unexpected behavior occurs during implementation
---

# Systematic Debugging

## The Rule

```
UNDERSTAND THE FAILURE BEFORE YOU TOUCH THE CODE.
```

Do NOT guess. Do NOT retry blindly. Do NOT change the test to make it pass. Investigate first, fix second.

## The Four Phases

### Phase 1: Investigate

Before changing ANY code:

1. **Read the error message thoroughly.** Not just the first line — the full stack trace, the file, the line number, the actual vs expected values.
2. **Reproduce consistently.** Run the failing test in isolation. Does it fail every time? Only sometimes? Only with other tests?
3. **Check what changed.** What did you just modify? `git diff` shows exactly what's different from the last green state.
4. **Examine the data.** Add a `console.log` or debugger at the failure point. What are the actual values? What did you expect? Where does the mismatch start?

### Phase 2: Pattern Analysis

5. **Find a working example.** Is there a similar test/query/endpoint in the codebase that works? Compare line by line.
6. **Document EVERY difference** between working and broken. The bug is hiding in one of those differences.
7. **Trace the data flow.** Follow the input from test setup through service through query through response. Where does the value diverge from expectation?

### Phase 3: Hypothesis

8. **Form a specific theory.** "The orgId filter is missing on getByEntity because I copied getByProperty and forgot to update the WHERE clause." Not "something is wrong with the query."
9. **Predict what the fix looks like.** Before touching code, write down what you'll change and what you expect to happen.
10. **Test ONE variable.** Change exactly one thing. Run the test. Did it fix it?

### Phase 4: Fix

11. **Write a failing test first** (if one doesn't exist for this specific bug). The test should reproduce the exact failure.
12. **Implement the minimal fix.** Do not refactor, do not clean up, do not "improve" adjacent code.
13. **Run the full suite.** Confirm the fix works AND nothing else broke.

## Anti-Patterns

| Bad Habit | Why It Fails | Do This Instead |
|-----------|-------------|----------------|
| Change code and re-run hoping it works | Each blind change compounds the problem | Investigate first, then make ONE targeted change |
| Change the test assertion to match actual output | Hides the bug, ships broken behavior | The test is right until proven otherwise. Fix the code. |
| Add more code to work around the symptom | Treats the symptom, not the cause | Find the root cause, fix it directly |
| "It works on my machine" / skip failing test | Defers the problem to production | If the test fails, the code is wrong. Fix it now. |
| Fix multiple things at once | Can't tell which change fixed (or broke) what | One change at a time, test after each |

## When Debugging Gets Stuck

If you've spent more than 15 minutes without progress:

1. **State what you know for certain.** Write it down. Separate facts from assumptions.
2. **State what you're assuming.** Each assumption is a potential error.
3. **Test your assumptions directly.** Don't trust "should work" — verify.
4. **Simplify the reproduction.** Can you make the failure happen with less code, less data, fewer moving parts?
5. **If still stuck after 30 minutes:** The bug may indicate an architectural issue, not a simple defect. Consider posting a comment on the story and marking `status:blocked`.

## Red Flags — STOP

- About to change code without understanding why it's failing
- About to change a test assertion to match broken behavior
- Making the same change a second time ("maybe I did it wrong the first time")
- Thinking "this makes no sense" without having traced the actual data flow
- Fixing a different file than the one the error points to, without evidence

## Integration

- **Used during:** `eng-tdd` RED-GREEN-REFACTOR when a test fails for the wrong reason or a green test unexpectedly breaks
- **Feeds into:** `eng-verify` after the fix is applied

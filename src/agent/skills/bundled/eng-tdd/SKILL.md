---
name: eng-tdd
description: Use when implementing any feature, story, bug fix, or code change — before writing any production code, when tempted to skip tests, or when code exists without tests
---

# Test-Driven Development

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
```

**Violating the letter of this rule IS violating the spirit of this rule.** There is no "pragmatic" exception. There is no "this one is too simple" exception. There is no "I already know what the code looks like" exception.

## The Cycle

For every behavior you implement:

### 1. RED — Write a Failing Test

- Write ONE test for ONE specific behavior
- One assertion per test. Test names describe the behavior.
- Use real code. Minimal mocking.
- Run the test. It MUST FAIL.
- Confirm it fails for the RIGHT reason (missing function/module, not syntax error or import issue).
- If the test passes immediately, your test is wrong — investigate.

### 2. GREEN — Write Minimal Code to Pass

- Write the SIMPLEST code that makes the test pass.
- No extra features. No over-engineering. No "while I'm here" cleanup.
- Run the test. It MUST PASS.
- Run the full suite. NO REGRESSIONS.

### 3. REFACTOR — Clean Up (Only After Green)

- Remove duplication, improve names, extract helpers.
- Keep changes minimal and purposeful.
- Run the full suite after every change. STILL GREEN.
- If tests break, revert. Try a smaller refactor.

### 4. REPEAT

Go back to RED for the next behavior. Continue until all behaviors in the story are covered.

## You Wrote Code Before Tests? Delete It.

If you realize you wrote production code without a failing test:

**DELETE THE CODE. START OVER WITH A FAILING TEST.**

No exceptions:
- Do NOT keep the code "as reference"
- Do NOT "adapt" the existing code while writing tests
- Do NOT look at it while writing tests
- Do NOT write tests that validate what the code already does
- Delete means delete. `git checkout -- <file>` or `rm` the file.

**Why this is non-negotiable:** Tests written after code are designed to pass. They test what the code does, not what the code should do. They catch nothing. A test that has never failed has never proven anything.

## Rationalization Table

If you hear yourself thinking any of these, STOP. You are about to violate TDD.

| Rationalization | Reality |
|----------------|---------|
| "It's only a 3-line change" | 3-line changes break production. The test takes 30 seconds. Write it. |
| "I already know what the code looks like" | Then the test should be trivial to write first. No excuse. |
| "The implementation is mechanical / obvious" | Obvious code still needs a test. The test documents the behavior for the next person. |
| "Zero design ambiguity — test-first adds no value" | Tests are not just for design. They catch regressions, document behavior, and prove correctness. |
| "Tests after validate actual behavior" | Tests after validate what the code happens to do, not what it should do. That's the difference between a specification and a rubber stamp. |
| "I already wrote the code and it works" | Delete it. Code without tests is not "done." It's a liability. |
| "Deleting working code is wasteful / dogmatic" | Keeping untested code is reckless. You'll rewrite it faster with TDD because you already understand the problem. |
| "I'm being pragmatic, not dogmatic" | Skipping tests is not pragmatic. It's borrowing time from the review cycle when Merlin requests changes. |
| "Process for the sake of process" | TDD is not process. It's engineering discipline. Bridges have load tests before traffic, not after. |
| "Write just enough to survive review" | You are not gaming a review. You are building software that handles financial data. Test it. |
| "I'll add tests in a follow-up" | You won't. And if you do, they'll be tests-after, which prove nothing. Write them now. |
| "The existing tests still pass" | Existing tests cover existing behavior. New behavior needs new tests. A test suite that doesn't cover the new code is not testing the new code. |
| "I'm tired / running low on context" | Fatigue argues FOR TDD, not against it. Tests constrain your tired implementation. They're the guardrail. |

## Red Flags — STOP and Restart

If you catch yourself doing any of these, you are violating TDD:

- Writing production code with no test file open
- Writing a test that passes on the first run (without any new production code)
- Thinking "I'll write the test after"
- Thinking "this is too simple for TDD"
- Thinking "I already know how this works"
- Thinking "just this once"
- Keeping code you wrote before the test "as reference"
- Writing tests that describe what the code does rather than what it should do
- Committing code with "will add tests later" in your reasoning

**All of these mean: STOP. Delete the code. Write a failing test. Then implement.**

## What Gets Tested

Every new behavior gets a test. Specifically:

- Every new endpoint: request/response shape, status codes, auth guard, error handling
- Every new service method: happy path, edge cases, error conditions
- Every new query: correct filtering, org-scoping, pagination
- Every new component: renders, user interactions, state changes
- Every new validation: accepts valid input, rejects invalid input
- Every new migration: data integrity preserved, no data loss
- Every bug fix: test that reproduces the bug FIRST, then fix

## What Does NOT Need a Test

- Configuration files (tsconfig, eslint, tailwind)
- Type definitions (interfaces, type aliases) with no runtime behavior
- Re-exports and barrel files
- Static content (copy, labels, constants)

## Verification After All Behaviors

After completing the RED-GREEN-REFACTOR cycle for all behaviors in a story, run verification before proceeding. Hand off to `eng-verify` skill.

## Anti-Patterns

### Tests That Prove Nothing

```typescript
// BAD: Written after code, mirrors implementation
test('returns data', () => {
  const result = service.getData();
  expect(result).toBeDefined(); // Proves nothing
});

// GOOD: Written before code, specifies behavior
test('returns active leases for the given property scoped to org', () => {
  const result = await service.getByProperty(propertyId, orgId);
  expect(result.every(l => l.propertyId === propertyId)).toBe(true);
  expect(result.every(l => l.orgId === orgId)).toBe(true);
  expect(result.every(l => l.status === 'active')).toBe(true);
});
```

### Excessive Mocking

```typescript
// BAD: Mocks the thing you're testing
jest.mock('./rent-roll.service');
test('service works', () => { ... }); // Testing the mock, not the service

// GOOD: Real code, real database (test DB), real assertions
test('filters leases by date range', async () => {
  await seedLeases([insideRange, outsideRange]);
  const result = await service.getByDateRange(start, end, orgId);
  expect(result).toContainEqual(expect.objectContaining({ id: insideRange.id }));
  expect(result).not.toContainEqual(expect.objectContaining({ id: outsideRange.id }));
});
```

### Coverage Without Meaning

Having 90% coverage with shallow tests is worse than 60% coverage with meaningful tests. Every test should answer: "What specific behavior am I proving works?"

## Real-World Impact

- Tests-first catch bugs at write time. Tests-after catch bugs at review time (if ever).
- TDD eliminates 80%+ of Merlin review round trips for missing tests.
- A failing test is a specification. A passing test is a guarantee. A missing test is a hope.

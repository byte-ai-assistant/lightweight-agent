---
name: eng-self-review
description: Use when implementation and verification are complete, before opening a PR or marking a story as ready for review
---

# Self-Review

## The Rule

```
SELF-REVIEW IS TWO SEPARATE PASSES. NOT ONE. NOT A SKIM. TWO.
```

After TDD and verification pass, review your own code in two structured passes before opening a PR. Each pass has a different lens and a concrete checklist. Do not combine them. Do not skip either.

**You cannot catch errors of omission by checking your work against your own mental model, because the omissions exist in the mental model too.** Use checklists and automated checks, not vibes.

## Pass 1: Spec Compliance

*"Did I build what was asked?"*

Read the story's acceptance criteria. For each criterion, find the code that implements it.

### Checklist

- [ ] Every acceptance criterion has corresponding implementation AND a test
- [ ] No behaviors are missing (compare criteria to actual code, not to your memory)
- [ ] No unrequested features were added (see Scope Discipline below)
- [ ] Response shapes match what the acceptance criteria describe
- [ ] Edge cases mentioned in the criteria are handled

### Scope Discipline

**If it's not in the acceptance criteria or the implementation plan, it should not be in the code.**

Remove unrequested additions before opening the PR. This includes:
- Extra parameters the plan didn't specify (sortBy, limit overrides, additional filters)
- Utility functions that aren't used by this story
- Refactoring of code outside the story's scope
- "Nice to have" features you added because "any list endpoint needs this"

**Do NOT fix unrelated code in your PR.** If you find a pre-existing bug, file it separately. Your PR should contain exactly what the story asked for, nothing more, nothing less.

| Rationalization | Reality |
|----------------|---------|
| "Adding sortBy is standard engineering practice" | The plan didn't ask for it. If it's needed, it gets its own story. Remove it. |
| "Any list endpoint needs this" | If it's that obvious, it should have been in the plan. It wasn't. Remove it. |
| "Removing it would be performative scope discipline" | Shipping unrequested code is scope creep, not pragmatism. It complicates review, adds untested surface area, and sets a precedent. |
| "The user will just ask for it next sprint" | Then they'll ask for it, it'll be planned, and it'll be implemented with TDD. That's the process working correctly. |

## Pass 2: Code Quality

*"Did I build it well?"*

Review the diff — not the full files, just what changed — as if someone else wrote it.

### Checklist

- [ ] Naming is clear and consistent with repo conventions
- [ ] Types are correct and complete (no `any`, no `as` casts hiding problems)
- [ ] Error handling is appropriate (not excessive, not missing)
- [ ] No security issues (see automated checks below)
- [ ] Follows existing repo patterns (controller -> service -> repository)
- [ ] No dead code, no commented-out code, no TODOs
- [ ] No console.log or debug statements left in

### Automated Checks — Run These, Don't Eyeball

You cannot reliably spot omissions by reading code. Run these grep checks on your changed files:

**Auth guards (BE):**
```bash
# Find controllers missing auth guards
grep -rL "UseGuards\|@Public" src/modules/<your-module>/*.controller.ts
```
If any controller file appears in the output, it's missing an auth guard. Fix it or confirm it's intentionally public.

**Tenant isolation (BE):**
```bash
# Find queries that might be missing org scoping
grep -rn "\.findMany\|\.findFirst\|\.select\|\.delete\|\.update" src/modules/<your-module>/*.ts | grep -v "orgId\|organizationId"
```
Every database query MUST include org scoping. If any line appears without an orgId filter, investigate.

**Financial type safety (BE):**
```bash
# Find potential float-for-money issues
grep -rn "number.*[Aa]mount\|number.*[Pp]rice\|number.*[Rr]ent\|number.*[Cc]ost\|number.*[Ff]ee\|number.*[Bb]alance" src/modules/<your-module>/*.dto.ts
```
Monetary values in DTOs must be `string` or a decimal-safe type, NEVER `number` (which is IEEE 754 float).

**If any automated check finds an issue: fix it, re-run `eng-verify`, then restart self-review from Pass 1.**

## What Self-Review Does NOT Replace

Self-review catches what YOU can see. Merlin catches what you CANNOT:
- Cross-module impact (does your change break another module?)
- Architectural consistency across the full repo
- Security patterns you don't know about
- Database design best practices you might miss

Self-review reduces Merlin's workload. It does not eliminate the need for Merlin.

## Red Flags — STOP

- About to open a PR without doing both passes
- Skipping Pass 1 because "TDD already proves the code works"
- Skipping automated checks because "I'm sure I added auth guards"
- Adding features during self-review ("while I'm reviewing, I might as well add...")
- Keeping unrequested code because "it's useful"
- Reviewing full files instead of just the diff (context makes problems invisible)

## Integration

- **Runs after:** `eng-tdd` (all behaviors implemented) and `eng-verify` (tests/build/lint clean)
- **Runs before:** opening a PR or marking a story as `status:in-review`
- **If issues found:** fix them, re-run `eng-verify`, then re-do BOTH self-review passes

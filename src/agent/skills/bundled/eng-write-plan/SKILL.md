---
name: eng-write-plan
description: Use when technical design is complete and you need to decompose an epic into stories with granular implementation tasks
---

# Write Implementation Plan

## The Rule

```
ZERO PLACEHOLDERS. ZERO "TBD". EVERY TASK IS SPECIFIC AND ACTIONABLE.
```

A plan that says "implement validation" is not a plan. A plan that says "add `@IsDateString()` decorator to `startDate` field in `src/modules/rent-roll/dto/rent-roll-query.dto.ts`" is a plan.

## Story Decomposition

### Stories Are Units of Deployment

Each story = one logical chunk of work that can be committed, reviewed, and merged independently.

**Story ordering rules:**
- Schema/migration stories FIRST
- Backend service/endpoint stories SECOND
- Frontend component stories THIRD
- Within a layer: shared/core before specific

**Story scope rules:**
- Each story produces testable, verifiable output
- Each story has clear acceptance criteria (derived from epic)
- Stories within the same repo go on the same branch as separate commits
- BE stories and FE stories are in separate repos → separate branches

### Tasks Are Implementation Steps

Each task within a story = one specific action taking 2-5 minutes.

**Every task MUST specify:**

1. **What to do** — create file, modify function, add test
2. **Exact file path** — `src/modules/rent-roll/rent-roll.service.ts`
3. **What the code should do** — specific behavior, not vague intent
4. **What test to write** — exact test description and assertion
5. **How to verify** — exact command with expected output

### Example: Good vs Bad

**BAD plan (vague):**
```
Story: Create rent roll endpoint
  - Set up the service
  - Add the controller
  - Write tests
  - Add validation
```

**GOOD plan (specific):**
```
Story #43: Rent roll query service + GET endpoint

Task 1: Create RentRollQueryService
  File: src/modules/rent-roll/rent-roll-query.service.ts
  Test: 'returns active leases for given property scoped to org'
    - Seed: 3 active leases for org-a/prop-1, 2 for org-b/prop-1
    - Call: service.getByProperty(prop1Id, orgAId)
    - Assert: returns exactly 3 results, all with orgId = orgA
  Verify: npm run test -- --filter rent-roll-query

Task 2: Add date range filter
  File: src/modules/rent-roll/rent-roll-query.service.ts
  Test: 'filters leases by date range'
    - Seed: leases starting 2026-01, 2026-03, 2026-06
    - Call: service.getByDateRange('2026-01-01', '2026-04-01', orgId)
    - Assert: returns exactly 2 results (Jan and Mar)
  Verify: npm run test -- --filter rent-roll-query

Task 3: Create RentRollController
  File: src/modules/rent-roll/rent-roll.controller.ts
  - GET /api/rent-roll with query params: propertyId, entityId, startDate, endDate
  - @UseGuards(AuthGuard) on controller class
  - Pagination via @Query() page, limit
  Test: 'GET /rent-roll returns 200 with paginated results'
  Test: 'GET /rent-roll returns 401 without auth token'
  Verify: npm run test -- --filter rent-roll.controller
```

## Plan Format

Post as a comment on the epic:

```markdown
## Implementation Plan

**Technical Approach:** [1-2 sentences from eng-technical-design]

### Story #N: [title] (scope:backend)
**Acceptance criteria:** [from epic, relevant to this story]

**Tasks:**
1. [Task with file path, behavior, test, verify command]
2. [Task...]
3. [Task...]

### Story #N+1: [title] (scope:frontend)
...
```

## Self-Review Before Posting

Before posting the plan:

- [ ] Every task has an exact file path
- [ ] Every task has a test description with specific assertions
- [ ] Every task has a verify command
- [ ] No task says "TBD", "TODO", "add validation", "handle errors", or "implement logic"
- [ ] Stories are ordered by dependency
- [ ] Tasks are ordered within each story
- [ ] Total task count is reasonable (3-6 tasks per story for a typical epic)

## After Posting

1. Create story issues as sub-issues of the epic
2. Each story issue gets: title, acceptance criteria, scope label
3. Proceed to Phase 3 of `eng-epic-cycle` (implementation)

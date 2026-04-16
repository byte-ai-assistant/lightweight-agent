---
name: eng-epic-cycle
description: Use when an epic is assigned with status:in-progress and needs implementation — orchestrates the full technical design, planning, and implementation workflow
---

# Epic Cycle

## Overview

This skill orchestrates the full lifecycle of implementing an epic in a single session. It chains the other engineering skills in order. Follow each phase completely before moving to the next.

## Preconditions

- Epic is `type:epic` with `status:in-progress`, assigned to you
- Epic has full requirements (goal, scope, acceptance criteria, BE/FE requirements)
- If requirements are unclear or incomplete: post a comment asking Sparky, set `status:blocked`, EXIT

## The Three Phases

### Phase 1: Technical Design

Load skill: `eng-technical-design`

- Read epic requirements thoroughly
- Load `be-repo-context` and `fe-repo-context` skills
- Explore 2-3 technical approaches
- Choose best approach with documented reasoning
- If blocked: post comment on epic, set `status:blocked`, EXIT

### Phase 2: Implementation Plan

Load skill: `eng-write-plan`

- Decompose epic into stories ordered by dependency
- Write granular tasks for each story (exact files, code, tests, commands)
- PUBLISH: post plan as comment on epic
- PUBLISH: create story issues as sub-issues of epic

### Phase 3: Implementation

For each story, in dependency order:

**3a. Create branch** (one per repo per epic):
- BE: `epic/N-slug` on `erp-be`
- FE: `epic/N-slug` on `erp-fe`
- Branch from `dev`

**3b. Implement with TDD** — load skill: `eng-tdd`
- For each behavior: RED (failing test) → GREEN (minimal code) → REFACTOR
- If a test fails unexpectedly: load skill `eng-debug`

**3c. Verify** — load skill: `eng-verify`
- Run all three: `npm run test`, `npm run build`, `npm run lint`
- All must pass clean before proceeding

**3d. Self-review** — load skill: `eng-self-review`
- Pass 1: spec compliance (acceptance criteria match, scope discipline)
- Pass 2: code quality (naming, types, security, automated grep checks)
- If issues found: fix, re-verify, re-review

**3e. Commit**
- Commit story to epic branch: `"Story #N: description"`

**3f. Repeat** for next story in same repo. When all stories for a repo are done:

**3f-bis. Update knowledge graph** — load skill: `eng-graphify`
- Run `graphify --update` to capture new code in the graph
- Commit `graphify-out/` changes to the epic branch
- This ensures the graph reflects all stories before the PR

**3g. Push and open PR**
- Push epic branch to remote
- Open PR: `"Epic #N: title. Closes #story1, Closes #story2..."`
- Mark stories as `status:in-review`

**3h. Repeat** for second repo if `scope:both`

### After All Stories

- **Cross-story consistency check:**
  - Do BE endpoints match what FE consumes?
  - Are types consistent across repos?
  - Any integration gaps between stories?
- **Update knowledge graph** in each repo that was modified (the graph now reflects the full epic)
- **Update** `be-repo-context` and `fe-repo-context` skills with new modules/patterns
- **Post comment** on epic: "All stories implemented. PRs ready for review."
- EXIT

## Hard Gates

- **Do NOT skip Phase 1.** Even if the approach seems obvious, document 2-3 options and choose with reasoning.
- **Do NOT skip Phase 2.** Even for small epics, write a plan with exact file paths and tasks.
- **Do NOT open a PR without Phase 3c and 3d.** Verification and self-review are mandatory for every story.
- **Do NOT implement stories out of dependency order.** BE before FE. Schema before logic. Shared before specific.

## Error Recovery

If this session crashes mid-epic, the next cron run will:
1. Read GitHub: epic still `in-progress`, some stories have PRs, some don't
2. Read the implementation plan (epic comment)
3. Pick up at the first unfinished story
4. Continue from Phase 3

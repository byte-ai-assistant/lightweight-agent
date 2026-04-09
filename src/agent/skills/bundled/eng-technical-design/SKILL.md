---
name: eng-technical-design
description: Use when starting work on an assigned epic, before writing any implementation plan or code
---

# Technical Design

## The Rule

```
EXPLORE BEFORE YOU COMMIT. DOCUMENT BEFORE YOU BUILD.
```

Do NOT jump to the first approach that comes to mind. Consider at least 2 alternatives, compare trade-offs, and choose with documented reasoning.

## The Process

### 1. Understand Requirements

- Read the full epic requirements (goal, scope, acceptance criteria, BE/FE requirements)
- Load `be-repo-context` and `fe-repo-context` skills
- Identify: what data models are involved? What endpoints are needed? What UI components?

### 2. Explore the Codebase

- What already exists that can be reused?
- What patterns does the codebase follow for similar features?
- What modules/services will this touch?
- Are there existing tests that show the expected patterns?

### 3. Propose 2-3 Approaches

For each approach, document:

```
Approach A: [name]
  How: [1-2 sentence description]
  Pros: [concrete benefits]
  Cons: [concrete drawbacks]
  Complexity: [low/medium/high]
  Fits existing patterns: [yes/no/partially]

Approach B: [name]
  How: ...
  Pros: ...
  Cons: ...
```

### 4. Choose with Reasoning

State which approach you're choosing and WHY. The reasoning should reference:
- How it fits existing codebase patterns
- Trade-offs you're accepting and why
- What you're explicitly NOT doing and why

### 5. Check for Blockers

Before proceeding to planning:
- Are the requirements clear enough to implement? If not: post comment, set `status:blocked`, EXIT
- Are there technical constraints the PM didn't consider? If so: post comment with alternatives, set `status:blocked`, EXIT
- Do you need a schema migration? Note it — migrations are high-risk and should be planned carefully

## What Gets Documented

Post your technical design as a comment on the epic. Include:
- Chosen approach and reasoning
- Key technical decisions (data model, API shape, component structure)
- Known risks or trade-offs accepted
- Dependencies between stories (what must be built first)

This comment becomes the reference for the implementation plan and for crash recovery if the session is interrupted.

## Anti-Patterns

- **First-idea bias:** Implementing the first approach you think of without considering alternatives
- **Over-engineering:** Choosing the "most elegant" approach when a simpler one works
- **Under-exploring:** "It's obvious" — obvious approaches still benefit from 2 minutes of documented comparison
- **Analysis paralysis:** Spending 30 minutes comparing approaches that differ by 5 lines of code. If approaches are nearly equivalent, pick one and move on.

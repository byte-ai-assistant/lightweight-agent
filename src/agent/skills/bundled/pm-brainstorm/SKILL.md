---
name: pm-brainstorm
description: Use when a CEO message arrives via Telegram requesting a feature, reporting a problem, or asking about product direction — before creating any GitHub issues
---

# Product Brainstorming

## The Rule

```
NO GITHUB ARTIFACTS UNTIL BRAINSTORMING IS COMPLETE.
```

Brainstorming happens entirely in the Telegram conversation. Do NOT create issues, epics, or labels on GitHub until you have full requirements with CEO alignment. This prevents race conditions with the cron state machine.

## The Process

### 1. Classify Intent

Before brainstorming, determine what the CEO is asking:

| Intent | Action |
|--------|--------|
| **Feature request** | Full brainstorming (steps 2-7) |
| **Bug report** | Quick triage → create `type:bug` on GitHub with available info |
| **Status question** | Answer from GitHub state, no issue created |
| **General discussion** | Discuss, no issue created |

If the CEO sends a message and goes offline (no reply to follow-up), create a `type:request` issue as a fallback for the cron state machine to pick up later.

### 2. Explore Context

- Load `product-context` skill (module inventory, roadmap, personas, design principles)
- Check current state: what's built, what's in progress, what's planned
- How does this request fit into the roadmap?

### 3. Clarify Requirements (one question at a time)

Ask via Telegram, wait for reply. One question per message.

**Essential questions:**
- Who is the primary user/persona?
- What problem does this solve for them?
- What's the scope? (read-only vs CRUD, single-entity vs cross-entity, etc.)
- Are there constraints? (timeline, dependencies, compliance)
- What does success look like?

**Stop asking when:** all ambiguity is resolved. Don't over-question — if the answer is obvious from context, don't ask.

### 4. Propose Approaches

Present 2-3 product approaches via Telegram:

```
I see a few ways we could approach this:

Option A: [description]
  - Pros: [ships faster, simpler, etc.]
  - Cons: [limited scope, etc.]

Option B: [description]
  - Pros: [more complete, etc.]
  - Cons: [takes longer, etc.]

I'd recommend A because [reasoning]. Thoughts?
```

Get CEO alignment before proceeding.

### 5. Write Structured Requirements (internally)

Draft the full epic requirements in session — do NOT post to GitHub yet:

- **Goal:** One sentence describing the business outcome
- **Scope:** What's IN and what's explicitly OUT
- **Target personas:** Who uses this and how
- **Acceptance criteria:** Testable, specific statements (not vague)
- **BE requirements:** Data model, endpoints, business rules
- **FE requirements:** Pages, components, interactions
- **Success metrics:** How we know this worked

### 6. Self-Review Requirements

Before publishing, check:
- [ ] No "TBD", "TODO", or vague requirements
- [ ] BE and FE requirements are internally consistent
- [ ] Acceptance criteria are testable (yes/no, not subjective)
- [ ] Scope is achievable in one epic
- [ ] Every question from step 3 is answered in the requirements

Fix any gaps. Re-ask the CEO if needed.

### 7. Publish (single atomic action)

Only now touch GitHub:
- Create epic issue with full requirements body
- Set labels: `type:epic`, `scope:[both|backend|frontend]`, `status:backlog`
- Place in correct repo (BE for scope:both/backend, FE for scope:frontend)
- Notify via Telegram: "Epic #N created and in the backlog"

## Key Principles

- **One question at a time.** Don't overwhelm the CEO with a list.
- **Multiple choice preferred.** Easier to answer than open-ended when possible.
- **YAGNI ruthlessly.** Remove scope from the requirements that isn't needed for v1.
- **The published epic is the contract.** Jeff should never need to ask "what did you mean by X?" because you already asked.

## Anti-Patterns

- Creating a GitHub issue before brainstorming is done (race condition with cron)
- Asking 5 questions in one message (CEO answers 2, ignores 3)
- Skipping brainstorming because "the request is clear" (it never is)
- Including requirements the CEO didn't ask for ("while we're at it...")
- Vague acceptance criteria ("users can easily view data")

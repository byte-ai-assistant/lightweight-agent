---
name: quant-strategy-cycle
description: Use when running a full quant-research cycle from a fresh research question to a finished strategy spec — orchestrates research → hypothesize → strategy-design, ends with hand-off to eng-epic-cycle
---

# Quant Strategy Cycle — Orchestrator

## Overview

This skill chains the three v1 quant phases in order. Each phase produces a markdown artifact that the next phase consumes. The terminal output is a strategy-spec doc the user hands to `eng-epic-cycle`.

```
research question
   → [quant-research]   → docs/quant/research/<date>-<topic>.md
   → [quant-hypothesize] → docs/quant/hypotheses/<date>-<name>.md
   → [quant-strategy-design] → docs/quant/strategies/<date>-<name>.md  ← hand-off doc
   → "Run /eng-epic-cycle with that strategy doc"
```

## Preconditions

- User has supplied a research question or topic (or you are resuming an in-flight chain).
- `EXA_API_KEY` is set (research phase depends on it).
- `docs/quant/{research,hypotheses,strategies}/` directories exist (create if not).

## Resume Logic

Before starting Phase 1, detect the highest-complete artifact for this topic. Ask the user if you should resume from there or start fresh.

```bash
ls -t docs/quant/strategies/ 2>/dev/null | head -5
ls -t docs/quant/hypotheses/ 2>/dev/null | head -5
ls -t docs/quant/research/   2>/dev/null | head -5
```

If the user confirms resume, jump to the next incomplete phase.

---

## Phase 1 — Research

Load skill: `quant-research`

- Input: the user's research question.
- Run the structured literature + market-structure survey.
- Output: `docs/quant/research/YYYY-MM-DD-<topic>.md`.
- **Gate:** research doc written on disk with at least one *Gaps* entry. Show the user the findings and ask: *"Shall we proceed to hypothesizing, or do you want me to dig deeper on any gap first?"* Wait for explicit go-ahead.

## Phase 2 — Hypothesize

Load skill: `quant-hypothesize`

- Input: the research doc from Phase 1 + the user's intuition/preferred angle.
- Construct one or more falsifiable hypotheses; run the anti-pattern checklist.
- Output: `docs/quant/hypotheses/YYYY-MM-DD-<name>.md`.
- **Gate:** hypothesis doc written, anti-pattern checklist passed (no unfalsifiable claims, no look-ahead, no missing mechanism). Ask the user: *"Which hypothesis should we spec out?"* Wait for an explicit selection.

## Phase 3 — Strategy Design

Load skill: `quant-strategy-design`

- Input: the chosen hypothesis from Phase 2.
- Produce a full implementable strategy spec using the STRATEGY OUTPUT FORMAT from `base-context.qmd`.
- Output: `docs/quant/strategies/YYYY-MM-DD-<name>.md` — **THE HAND-OFF DOC**.
- **Gate:** strategy doc written with every required section populated (no TBD / TODO). The *Invariants* and *Acceptance Criteria* sections must be numeric and specific, not hand-wavy.

## Terminal State

After Phase 3, print exactly:

```
READY FOR ENGINEERING. Run /eng-epic-cycle with docs/quant/strategies/<file>.md as input.

The strategy spec includes:
 - Signal definition, universe, entry/exit rules, position sizing, risk limits
 - Invariants the backtest code MUST uphold (look-ahead, fills, fees, survivorship)
 - Numeric acceptance criteria for what makes this live-worthy
 - Required robustness checks (OOS split, regime splits, parameter sensitivity)

Once the backtest is implemented, return here and we can interpret the results.
```

Then EXIT. Do not invoke any `eng-*` skill from this orchestrator.

## Hard Gates

- **Do NOT skip Phase 1.** Even if the user believes they already know the literature, run the research phase. The anti-pattern `confirmation bias` lives here.
- **Do NOT skip Phase 2.** A hypothesis is not the same as a strategy. Pattern: "momentum works" is a research finding; "5-period return predicts 1-period forward return with effect size ≥ 10bps net of fees" is a hypothesis.
- **Do NOT write code.** Not in any phase. The terminal output is markdown. The engineer writes code.
- **Do NOT auto-invoke `eng-epic-cycle`.** The hand-off is a human decision. Print the instruction and stop.
- **Every gate requires user approval in-chat.** You do not self-advance through phases.

## Error Recovery

If this session crashes mid-cycle, the next invocation of `quant-agent` will detect the highest-complete artifact and ask whether to resume. Artifacts are idempotent — a re-run of a phase overwrites its output file (with a confirmation prompt) but leaves prior phases untouched.

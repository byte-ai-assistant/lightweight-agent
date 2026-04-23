---
name: quant-strategy-design
description: Use after quant-hypothesize when a hypothesis has been selected — produces the final hand-off doc that eng-epic-cycle consumes to implement the backtest, with all sections required for engineering implementation
---

# Quant Strategy Design

## Working directory

The agent's pinned working directory is `{root}`. Quant artifacts live under `{root}/docs/quant/<topic-slug>/`, one directory per research topic. Write the strategy doc into that topic's `strategies/` subfolder — never to a flat shared folder.

## The Rule

```
UNAMBIGUOUS. NUMERIC. ENGINEER-READY. INVARIANTS ENFORCED.
```

This is the terminal quant artifact. Its sole reader is an engineer implementing a backtest. Anything you leave vague becomes an engineer's assumption; assumptions become bugs; bugs become backtest results that mislead you. The spec is done when an engineer could implement it without asking you a question.

## Inputs

- The hypothesis doc chosen by the user from `quant-hypothesize`.
- Upstream research for context.
- The user's capital / risk tolerance if they want it specified (otherwise use placeholder and call it out).

## The Process

Fill in all nine sections below. If you cannot fill a section, the spec is not ready. Do not leave TBDs in the final doc — either fill them or block and ask the user.

### 1. Universe — Which Markets

Specify exactly which markets are eligible at trade time. This is survivorship-critical.

- **Venue**: Polymarket (or other).
- **Category filter**: e.g. politics + sports, exclude crypto price markets.
- **Min liquidity**: top-of-book $ or depth-at-N-levels threshold.
- **Min notional**: total $ traded in the last X hours.
- **Time-to-resolution bounds**: e.g. between 6h and 30d from resolution.
- **Exclusion rules**: multi-outcome markets, ambiguous oracle conditions, markets flagged for dispute history, delisted markets, markets with known MM absence.
- **Availability rule**: the universe is computed at each rebalance using only information available at that timestamp. State the lookback window and exact cutoff.

### 2. Signal — Exact Formula

No "the signal is roughly 5-period momentum". Write the formula.

- **Inputs**: which columns, from which data source, at which frequency. E.g. `trades.parquet` columns `ts`, `market_id`, `price_token1`, `size`.
- **Lookback window**: exact length in time or ticks.
- **Resampling convention**: if converting trades to bars, state bar definition (time bars of length T, or volume/dollar bars of threshold Q).
- **Formula**: literal mathematical expression.
- **Edge cases**: what if the market has zero trades in the lookback? What if the book is one-sided? Specify the behavior.
- **Signal normalization** (if any): cross-sectional rank, z-score, rolling percentile.

### 3. Entry Rules

- **Trigger threshold**: signal value that fires an entry.
- **Token direction**: Token1 or Token2, with justification tied to the hypothesis. Non-optional.
- **Timing**: when exactly do you trade after signal fires? Next tick? Next bar close? Next N seconds?
- **Multi-fire handling**: if signal re-fires while position is open, do you add, hold, or ignore?
- **Per-market cooldowns**: enforce a minimum gap between trades on the same market to avoid self-reinforcing loops (see base-context.qmd).
- **Crossing detection**: if another live strategy holds this market, skip or coordinate (base-context.qmd rule).

### 4. Exit Rules

- **Primary exit**: signal decay, take-profit, time-stop, or resolution-eve?
- **Stop-loss policy**: default is NO stop-loss on binary markets (base-context.qmd). If you override, justify in-doc.
- **Max holding period**: hard cap.
- **Resolution handling**: close X hours before resolution to avoid oracle-timing risk, or hold to resolution?
- **Exit slice size / pacing**: DCA out in N clips, or market-out at once?

### 5. Position Sizing

- **Method**: fixed fraction, vol-targeted, Kelly-capped, or inverse-variance.
- **Formula**: literal expression with named inputs.
- **Clip size policy**: DCA (base-context.qmd rule) — per-clip size as a fraction of observed top-of-book depth.
- **Max per-market position**: absolute $ and % of equity cap.
- **Rebalance cadence**: continuous, every N seconds, per-tick?

### 6. Risk Limits

- **Max gross exposure**: % of equity.
- **Max concentration**: per category, per correlated cluster.
- **Drawdown kill-switch**: if equity drops X% from trailing peak, halt new entries and reduce.
- **Oracle-risk cap**: max exposure to markets sharing a common oracle / dispute risk.
- **Capacity estimate**: hard cap on strategy capital based on fill-rate research.

### 7. Invariants the Backtest Code MUST Uphold

**This is the section the engineer will read most carefully. Be specific, not aspirational.**

- **No look-ahead on feature computation**: state the exact information cut-off for every feature. E.g. *"Signal at time t uses only trades with ts ≤ t − 1s; book state uses snapshot at t − 1s."*
- **No survivorship in universe selection**: universe at time t is computed using only data available at time t. Markets that later delisted must be included in the universe during the periods they were active.
- **Realistic fill model**: fills MUST consume book depth VWAP at intended clip size. Paper fills at mid are forbidden. Specify the book-depth source and timestamp precision.
- **Fee accounting**: Polymarket maker rebate / taker fee applied per fill. Gas cost per round-trip. State exact fee schedule version used.
- **Token direction enforcement**: every trade explicitly records Token1 or Token2. No inference from net P&L.
- **Time-zone / resolution-time handling**: all timestamps UTC. Resolution times validated against the historical resolution log, not market close times.
- **Clock alignment**: signal timestamps and book-state timestamps must use the same clock with explicit latency assumption (e.g. *"assume 500ms network + venue latency"*).
- **State any other invariant specific to this strategy**.

If a reader cannot translate an invariant into an assertion in the backtest code, re-write the invariant.

### 8. Backtest Acceptance Criteria

Numeric bars that make this live-worthy. These are commitments — do not revise after seeing results without renaming the strategy.

- **Min OOS net Sharpe**: e.g. ≥ 0.8.
- **Max drawdown**: e.g. ≤ 15% on OOS window.
- **Min hit rate** (if binary-direction): e.g. ≥ 54%.
- **OOS split methodology**: time-based only (not random shuffle). Exact split dates. Walk-forward window size if applicable.
- **Required robustness checks**:
  - Regime splits (pre/post specific events, by volatility regime).
  - Parameter sensitivity (does Sharpe survive ±20% on every knob? if not, overfit).
  - Universe subset robustness (top-half and bottom-half liquidity both show signal).
  - Bonferroni correction over all variants tested — state N and adjusted p-value.
  - Fill-rate realism check — simulated fills reconciled against historical book depth.
- **Capacity floor**: strategy must show positive net Sharpe at ≥ $X gross exposure.
- **Failure policy**: if any criterion fails, the strategy goes to KILL or to explicit *revise-hypothesis* — not *tune-parameters*.

### 9. Data Requirements

- **Historical data**: dataset names, date ranges, granularity, fields, source.
  - Polymarket trades: `/Users/byte/Documents/polymarket/poly_data/processed/trades.parquet` (from base-context.qmd).
  - Polymarket markets: `/Users/byte/Documents/polymarket/poly_data/markets.csv` (from base-context.qmd).
  - Book depth snapshots: where from? if not available locally, the strategy is not implementable without a data ingestion story.
- **Refresh pipeline**: `/Users/byte/Documents/polymarket/poly_data` (from base-context.qmd).
- **Additional external data**: specify source, auth, and refresh cadence.
- **Data hygiene assumptions**: deduplication rules, handling of corrected trades, null handling.

## Output

Write to `{root}/docs/quant/<topic-slug>/strategies/YYYY-MM-DD-<name-slug>.md`. This is the hand-off doc. Every section above becomes a section in the doc. Use the STRATEGY OUTPUT FORMAT fields from `base-context.qmd` as the spine:

> *Hypothesis · Entry rule · Universe filter · Token direction · Position sizing · Exit conditions · Fee and slippage model · Backtest results (to be filled by engineer) · Out-of-sample validation · Fill rate and capital utilization · Regime dependency · Known failure modes*

Include at the top:

```markdown
# Strategy: <name>

**Date:** YYYY-MM-DD
**Upstream hypothesis:** docs/quant/<topic-slug>/hypotheses/<file>.md
**Upstream research:** docs/quant/<topic-slug>/research/<file>.md
**Status:** SPEC COMPLETE — READY FOR ENG

## Summary (1 paragraph)
<For a reader who will only read this paragraph.>

## Sections 1–9 in the order above.

## For the Engineer
- Entry point: implement as a new strategy module under <path>.
- Backtest framework: <if the repo has one, name it; else flag as "no framework — engineer to propose in eng-technical-design">.
- Test coverage required: one test per invariant in §7; one test per acceptance criterion in §8.
- Hand-off complete — proceed via /eng-epic-cycle with this file as input.
```

## Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "The engineer can figure out the fill model" | No. An engineer defaulting to mid-price fills produces a backtest that dies in live trading. Specify the book-depth source and VWAP rule. |
| "Stop-losses are a nice-to-have — I'll let the engineer add them" | Stop-loss policy is part of the strategy. On Polymarket the default is NO stop-loss (base-context.qmd). If you override, document. |
| "Invariants are engineering concerns" | Invariants are where quant rigor lives. If the backtest violates look-ahead, the number is meaningless. State invariants precisely so they become assertions. |
| "Acceptance criteria are guidelines, we can flex" | Then they are not criteria. Either commit to a number or rename the strategy when you change it. Retrofitting criteria to results is the oldest p-hack in the book. |
| "Capacity is a v2 concern" | Capacity is v0. A strategy that only works at $1k is not worth implementing. Set a capacity floor. |
| "Token direction follows from the signal sign" | Write it down explicitly anyway. Silent sign errors are the most common quant bug. |
| "The universe is 'liquid markets' — the engineer will define it" | No. Numeric liquidity threshold, numeric time-to-resolution bounds, exact exclusion rules. A vague universe is a survivorship bug in the making. |
| "Robustness checks slow us down" | They catch the overfits before you deploy. Skipping them is not speed; it's debt. |
| "This is just the first draft, we'll refine in backtest" | Refining spec *in response to backtest results* is the canonical path from edge to overfit. Refine the spec before, not after. |

## Anti-Patterns

### Too Many Free Parameters
Count your parameters. Count your unique tradable observations. If parameters > observations/20, the backtest will overfit no matter what. Simplify the signal or expand the universe.

### Mid-Price Fills
Any spec that implies fills at the midpoint is inadmissible on Polymarket. Book depth is thin. Fills consume VWAP up through levels. State this explicitly in §7 Invariants.

### Fees / Gas Omitted
A strategy spec that doesn't name the exact fee schedule is unreliable. Fee schedules change. Lock to a version. Include gas.

### Universe Survivorship
Selecting the universe using info that wasn't available at the test time (e.g. "markets that had >$1M total volume by resolution"). The universe MUST be computed from the trade-time lookback only.

### No OOS Plan
A single train/test split is not enough. Specify walk-forward dates, regime splits, and universe subsets.

### Vague Invariants
*"Be careful about look-ahead"* is not an invariant. *"Signal at time t uses only trades with ts ≤ t − 1s"* is an invariant. The difference is whether an engineer can write an assertion from it.

### Overfit Acceptance Bars
Copying reported Sharpes from a paper without haircutting for publication bias and regime decay. A paper reporting Sharpe 2.0 in 2015 suggests Sharpe 0.5–1.0 is a reasonable live-bar in 2026.

### Regime Blindness
A strategy whose edge lives in one 6-month window is not a strategy — it's a regime. Either detect the regime live or spec the strategy as regime-contingent with explicit detection rules.

## Completeness Checklist

Before writing the hand-off line, verify:

- [ ] All nine sections filled with no TBD / TODO.
- [ ] Every invariant in §7 is assertable in code (an engineer could write a test for it).
- [ ] Every acceptance criterion in §8 is numeric.
- [ ] Token direction stated explicitly (Token1 or Token2) with justification.
- [ ] Fill model is depth-weighted VWAP, not mid.
- [ ] Universe rules are survivorship-safe.
- [ ] Failure policy is KILL or REVISE, not TUNE.

Only when every box is checked, print the hand-off line at the end of the doc:

```
READY FOR ENGINEERING. Run /eng-epic-cycle with this file as input.
```

## Handoff

After writing the spec, control returns to `quant-strategy-cycle`, which prints the hand-off instruction. The user, not the orchestrator, invokes `/eng-epic-cycle`.

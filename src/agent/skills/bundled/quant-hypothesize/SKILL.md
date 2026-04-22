---
name: quant-hypothesize
description: Use after quant-research completes, before any strategy design — turns research findings into one or more falsifiable hypotheses with predicted effect size, proposed mechanism, and explicit kill criteria
---

# Quant Hypothesize

## The Rule

```
FALSIFIABLE. NUMERIC. MECHANISM-BACKED. KILL-CONDITION EXPLICIT.
```

A hypothesis is not *"momentum works on Polymarket."* That's a claim without teeth. A hypothesis is:

> *The 5-period trailing price return of Token1 predicts the next-period return of Token1 with effect size ≥ 10bps net of fees, on Polymarket political markets with top-of-book liquidity ≥ $5k, between 6 and 72 hours before resolution, because late-arriving retail flow underreacts to public news within that window.*

That one has: a signal, a horizon, a universe, a numeric effect size, a mechanism, and — implicitly — a kill condition (*< 10bps net of fees = dead*).

## Inputs

- The research doc from `quant-research`, especially the *Gaps* section.
- The user's intuition or preferred angle (ask if not provided).

## The Process

For each candidate hypothesis, fill in all six required sections below. If you cannot fill a section, the hypothesis isn't ready — iterate or kill it.

### 1. Claim (Falsifiable Form)

State the hypothesis as a single sentence containing:

- **Signal X** — computable, exactly specified (formula, inputs, lookback).
- **Prediction Y** — what this signal predicts (next-period return? binary direction? reversion?).
- **Sign S** — positive, negative, or absolute.
- **Effect size ≥ E** — in basis points or hit-rate-over-50%, numeric, net of plausible fees.
- **Universe** — which markets, which tokens (Token1 or Token2 — be explicit), which regime.
- **Horizon** — holding period.

Template:

> *Signal <X> on universe <U> predicts <Y> with sign <S> and effect size ≥ <E> over horizon <H>.*

### 2. Mechanism

**Why should this work?** Name the source of alpha. One of:

- **Behavioral** — someone systematically mispriced by cognitive bias (e.g. base-rate neglect, availability heuristic).
- **Structural** — venue mechanics force suboptimal trades (e.g. forced liquidation, oracle-timing effects, market-maker inventory constraints).
- **Informational** — asymmetric information that resolves on a predictable schedule (e.g. resolution-eve news flow).
- **Microstructural** — order-book dynamics (e.g. order-flow imbalance, queue position).

If you cannot name a mechanism, the hypothesis is an unexplained empirical pattern — high overfitting risk. Either find a mechanism or kill the hypothesis. Pattern-without-mechanism hypotheses survive rarely; they are the single most common source of backtest-to-live disappointment in quant work.

### 3. Predicted Effect Size & Direction

Numeric. Put a stake in the ground before seeing results.

- Expected Sharpe (OOS) — e.g. 0.8–1.5
- Expected hit rate — e.g. 54–58% (on binary direction calls)
- Expected effect per trade — e.g. 8–15bps net of fees
- Expected capacity — what size before fills start eating the edge?

If your prediction is "I don't know, let's see what the backtest says" — you have not made a hypothesis. You have made a fishing expedition.

### 4. Falsifiability Criteria — What Kills This Hypothesis

**Write the kill conditions before running the backtest.** If the backtest produces any of these, the hypothesis is dead and must not be rescued by parameter tweaking.

- Effect size below threshold: e.g. *"OOS net Sharpe < 0.3 kills it"*
- Wrong sign: e.g. *"If net return is negative on post-2024 markets, kills it"*
- Regime failure: e.g. *"If the effect is concentrated in a single 3-month window, kills it"*
- Fill-rate failure: e.g. *"If realized fill rate < 10% at intended clip size, kills it"*
- Robustness failure: e.g. *"If effect disappears when top quartile by liquidity removed, kills it"*

### 5. Alternative Explanations

What else could produce this pattern in historical data without being a tradable edge?

- **Data mining** — you tested N variants and kept the best; Bonferroni-correct.
- **Survivorship** — your universe only includes markets that resolved / didn't get delisted.
- **Look-ahead** — the signal uses information not available at trade time (resolution info, post-event prices, post-trade volume).
- **Non-stationarity** — the regime that produced this effect no longer exists.
- **Measurement artifact** — mid-price fills vs realistic fills; ignoring spread.
- **Adverse selection** — you got fills because informed traders wanted you to; now you're holding their bags.

List at least three plausible alternatives and how you will rule each one out in the backtest.

### 6. Mechanism Cost Check

Given the proposed mechanism, do the economics survive?

- Polymarket taker fees (check current fee schedule, do not guess).
- Expected slippage at intended clip size (order of magnitude, based on typical book depth from research).
- Gas cost per round-trip (L2 but not free).
- Capital utilization — if fill rate is 15% at intended size, the realized Sharpe is dramatically lower than book Sharpe.

If the numeric prediction in §3 does not survive this cost check, **kill the hypothesis now**. Do not proceed to strategy design with a hypothesis that is unprofitable at realistic costs.

## Output

Write to `docs/quant/hypotheses/YYYY-MM-DD-<name-slug>.md`:

```markdown
# Hypothesis: <short name>

**Date:** YYYY-MM-DD
**Upstream research:** docs/quant/research/<file>.md

## Claim (falsifiable)

<one sentence, template above>

## Mechanism

**Type:** behavioral | structural | informational | microstructural
**Why this works:** <paragraph — the causal story>
**Who is on the other side of the trade:** <who is systematically wrong, and why they stay wrong>

## Predicted effect size & direction

- Expected Sharpe (OOS): <range>
- Expected hit rate: <range>
- Expected per-trade edge (net of fees): <bps>
- Expected capacity: <$ size before edge decays>

## Falsifiability — these kill the hypothesis

1. <numeric condition>
2. <...>
3. <...>

## Alternative explanations to rule out

| Alternative | How the backtest rules it out |
|-------------|-------------------------------|
| Data mining | <Bonferroni correction across N variants tested> |
| Survivorship | <Universe selection rule, see strategy-design> |
| Look-ahead | <Exact timing rules for feature availability> |
| Non-stationarity | <Regime split / walk-forward validation plan> |
| ... | ... |

## Mechanism cost check

- Taker fee per round-trip: <%>
- Estimated slippage at intended clip size: <bps>
- Per-trade edge required to break even: <bps>
- Per-trade edge predicted: <bps>
- **Survives costs?** yes | no (if no, KILL HERE)

## Next step

If accepted: proceed to `quant-strategy-design` with this hypothesis.
If rejected: return to `quant-research` or revise claim.
```

## Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "Let me just backtest it and see" | That's not hypothesizing, that's fishing. Fishing expeditions produce overfit Sharpes that die in live trading. Make a numeric prediction first. |
| "I can't put a number on effect size without running the backtest" | Literature gives you a starting range. Pick one. A wrong prior you revise is infinitely better than no prior. |
| "The mechanism is obvious — it just works" | Write it down in one sentence. If you can't, you don't understand it. If you do, the write-up costs nothing. |
| "Stop-losses in binary markets are fine, I'll add them later" | From base-context.qmd: "Hold to resolution. Stop-losses in binary markets crystallize losses that would have reversed." Stop-losses ARE the hypothesis change — re-examine. |
| "I'll let the backtest decide which token to trade" | Wrong. From base-context.qmd: Token1 vs Token2 is part of the hypothesis, not a free parameter. Getting direction wrong silently inverts signals. |
| "I've tested five variants and this one works best" | Bonferroni. Your multiple-testing-adjusted p-value is 5x weaker. Report it honestly or don't report it. |
| "The effect is strongest in 2022 — I'll use that window" | That's a regime, not an edge. Either explain the regime and detect it live, or kill. |
| "The mechanism is hard to articulate but the pattern is real" | Patterns without mechanisms are the #1 source of backtest-live divergence. Articulate or kill. |
| "Alternative explanations can be evaluated later in the backtest" | They must be ruled out BY DESIGN in the strategy spec, not hoped away in the results. Name each one now. |

## Anti-Patterns

### Unfalsifiable
"Momentum works sometimes" — no. Falsifiable hypotheses have numeric conditions that could produce a "dead" verdict. If no result kills it, it's not a hypothesis.

### Pattern Without Mechanism
"The 7-day price-change-of-second-tier-categories predicts next-day returns" with no mechanism. High prior probability of data-mining artifact. Either find a mechanism or kill.

### Resolution-Risk Blindness
On Polymarket, the oracle can misresolve, disputes delay settlement, and some markets have real ambiguity about which outcome occurred. A hypothesis that ignores resolution risk on event markets is underspecified. Name it and bound it.

### Survivorship Bias
Testing only markets that reached resolution ignores markets that delisted, got canceled, or had their tokens liquidated. Your live universe is different from your backtest universe. Spec the universe rules precisely.

### Look-Ahead
Using any information — token prices, volumes, wallet features, news flags — that was not available at the exact timestamp of the trade decision. Walk-forward only. Name the information availability rule for every feature.

### Ignoring Base Rate of P-Hacked Claims
The published quant literature has a replication crisis. A finding from a single 2019 paper with Sharpe 2.1 has roughly 30-50% probability of being spurious. Haircut accordingly and re-test on fresh data.

## Handoff

When the hypothesis doc is complete and the user picks one hypothesis to pursue, the cycle proceeds to `quant-strategy-design`. Multiple hypotheses can be spec'd but each becomes a separate strategy doc — do not bundle.

---
name: quant-research
description: Use when starting a fresh quant research question, before any hypothesis — surveys academic literature, market structure, and existing strategies to build a sourced foundation with an explicit gap list
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Quant Research

## The Rule

```
SOURCED FINDINGS. EXPLICIT GAPS. NO HYPOTHESES YET.
```

The research phase produces a landscape of **what is known and by whom**, rated by source quality. It does **not** produce hypotheses, predictions, or strategy ideas. Those come in the next phase. If you catch yourself writing "this suggests we could..." — stop. That belongs in `quant-hypothesize`.

## Inputs

- A research question from the user (e.g. *"does intraday momentum work on high-liquidity Polymarket election markets?"*).
- If the question is vague, ask one focusing question before proceeding — e.g. *"which category of Polymarket market are you thinking: politics, sports, crypto? And what holding horizon?"*

## The Process

### 1. Frame the Question

Write the refined question as the first line of the output doc. State what would count as evidence for and against the underlying pattern.

### 2. Survey Academic Literature

Use `web_search_advanced_exa` with `category: "research paper"` and `web_search_exa` to surface:

- Peer-reviewed papers (JFE, Journal of Finance, RFS, Review of Financial Studies, arxiv q-fin)
- Working papers on SSRN
- Industry whitepapers from credible firms (AQR, Man, Renaissance publications, academic-industry collaborations)

For each source, extract: claim, methodology, data used, effect size, sign of result, known caveats.

Also check `deep_researcher_start` / `deep_researcher_check` for multi-step deep research if the question is broad.

### 3. Survey Market Structure

For prediction-market questions, survey the *venue mechanics* not just the signal. For Polymarket specifically:

- CLOB mechanics (order types, maker/taker, price-time priority)
- Fee structure (maker rebates, taker fees, gas on L2)
- Oracle mechanics (UMA DVM resolution, dispute window, oracle failure history)
- Resolution timing (how long after the real-world event does the market settle?)
- Liquidity distribution (typical book depth by category; where the thin books are)
- Market-making presence (is there a known MM? does their behavior create patterns?)

For other markets (equities, crypto, etc.), adapt this list to the venue.

### 4. Survey Existing Strategies

What have others published or discussed about this exact signal/edge?

- Public repos, Kaggle notebooks, blog posts from practitioners
- Twitter/X threads from credible traders
- Conference talks / podcasts

Take these as **signals of crowding and of decayed edge**, not as authorities.

### 5. Rate Every Source

For each source in the output doc, rate quality:

| Tier | Source type |
|------|-------------|
| A | Peer-reviewed top journal |
| B | Working paper from credible institution / reproduced by others |
| C | Industry whitepaper with disclosed methodology |
| D | Blog post from practitioner with reputation |
| E | Forum post / anonymous Twitter thread |

Do not cite Tier E as evidence. Cite it only as "signal that the edge is widely known".

### 6. Enumerate Gaps

The *Gaps* section is mandatory. It's the most useful output of this phase for the next phase (hypothesize).

- What questions does the literature NOT answer?
- What market-structure facts haven't been tested?
- What time periods / regimes are underrepresented?
- Where does the literature disagree with itself?

No gaps found = you did not look hard enough. Go back to step 2.

## Output

Write to `docs/quant/research/YYYY-MM-DD-<topic-slug>.md` with this structure:

```markdown
# Research: <topic>

**Date:** YYYY-MM-DD
**Research question:** <one-sentence, specific>

## What would count as evidence
- For:  <concrete, observable, measurable>
- Against: <concrete, observable, measurable>

## Key findings

### From academic literature
- Finding 1 [A-tier, Author et al. 2022] — <claim, effect size, caveat>
- Finding 2 [B-tier, Working paper 2024] — <...>

### From market structure
- <Polymarket-specific fact> — <why it matters>

### From existing public strategies
- <Description> — <source, crowding implication>

## Sources (rated)

| Source | Tier | Relevance |
|--------|------|-----------|
| <citation / URL> | A | <one-line summary> |

## Gaps (open questions)

1. <Specific unanswered question>
2. <...>

## Relevant data sources / APIs

- <Where we would get the data to test a hypothesis>
- <Existing local data: e.g. /Users/byte/Documents/polymarket/poly_data/processed/trades.parquet>
```

## Rationalization Table

If you hear yourself thinking these, STOP. You are not doing research — you're doing motivated reasoning.

| Rationalization | Reality |
|-----------------|---------|
| "Let me just jump ahead — I already know what the hypothesis will be" | Then writing the gaps section will be trivial. Do it first. Research tells you whether your intuition survives contact with prior evidence. |
| "Three blog posts say this works, that's enough" | Blog posts are Tier D/E. You need at least one Tier A/B source or you're building on sand. |
| "The paper disagrees with my intuition, but the paper used different data" | That's the gap. Write it as a gap and design the hypothesis to exploit it, don't dismiss it. |
| "This is just a quick check, I don't need sources" | A quick check without sources produces hypotheses you can't defend when the backtest disappoints. |
| "Polymarket is too new for there to be relevant literature" | Literature on prediction markets, binary-outcome derivatives, and small-cap equities all applies. Look wider. |
| "I can skip the market-structure section, I already know Polymarket" | Write it anyway. The act of writing forces precision. The engineer reads this to understand the venue. |

## Anti-Patterns

### Confirmation Bias
Only citing sources that agree with a pre-existing intuition. Fix: for every claim you accept, name one credible source that disagrees (or write "no disagreement found" and explain why).

### Blog-as-Authority
Citing a Tier D/E source as evidence. Fix: demote it to "signal of crowding" and find a Tier A/B source for the actual claim.

### Missing Market-Structure Basics
Producing a research doc that says nothing specific about the venue. Fix: the market-structure section must have at least three venue-specific facts that affect strategy design.

### No Gap Enumeration
Writing a research doc that reads "everything is known, we just need to implement". Fix: if no gaps exist, the edge is crowded and the hypothesis phase should be much more skeptical — say so.

### Scope Creep
Turning "does momentum work on Polymarket election markets?" into a survey of all prediction-market strategies. Fix: respect the scope of the question. Note adjacencies as *Related Work*, not as findings.

## What Gets Cited

- Paper title, authors, year, venue, URL/DOI.
- For web sources: title, publication/domain, date, URL.
- For local data: full path.
- No "various sources" or "common knowledge". Every claim has a cite or is flagged as *unverified*.

## Handoff

When the output doc is complete and the user approves findings, the cycle proceeds to `quant-hypothesize`. The gaps section of this doc is the main input to hypothesizing — a hypothesis that doesn't target a gap is either restating known results or is overfit to this specific dataset.

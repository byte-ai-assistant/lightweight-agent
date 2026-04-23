---
name: sci-hypothesize
description: Use after sci-graphify completes — turns research findings and graph insights into one or more falsifiable scientific hypotheses with predicted effect size, mechanism, pre-specified kill criteria, explicit alternative explanations to rule out, and statistical considerations. Refuses unfalsifiable claims and pattern-without-mechanism hypotheses. Hypotheses are tagged back to specific graph nodes and communities so the experiment can trace its scientific lineage.
---

# Sci Hypothesize

## Working directory

The agent's pinned working directory is `{root}`. Scientific artifacts live under `{root}/docs/sci/<topic-slug>/`, one directory per research project. Write the hypothesis doc into that project's `hypotheses/` subfolder — never to a flat shared folder outside the project directory.

## The Rule

```
FALSIFIABLE. NUMERIC. MECHANISM-BACKED. KILL-CONDITION EXPLICIT. GRAPH-TAGGED.
```

A hypothesis is not *"the gut microbiome affects depression."* That's a claim without teeth. A hypothesis is:

> *A one-standard-deviation decrease in stool 16S rRNA alpha-diversity (Shannon index) predicts a 0.15–0.30 SD increase in PHQ-9 score at 12 months, net of age/sex/BMI/diet, in community-dwelling adults aged 30–65, because reduced short-chain-fatty-acid production by gut commensals elevates systemic IL-6, which crosses the blood-brain barrier and reduces hippocampal neurogenesis.*

That one has: a signal (Shannon index), a prediction (PHQ-9 change), a sign (negative signal → positive outcome), a numeric effect size (0.15–0.30 SD), a universe (adults 30–65), a horizon (12 months), a mechanism (SCFA → IL-6 → hippocampus), and — implicitly — a kill condition (*< 0.15 SD = dead*).

## Inputs

- The research doc: `{root}/docs/sci/<topic-slug>/research/YYYY-MM-DD-<topic-slug>.md`.
- The graph reading doc: `{root}/docs/sci/<topic-slug>/graphs/YYYY-MM-DD-<topic-slug>.md`.
- The graph JSON: `{root}/docs/sci/<topic-slug>/graphs/graphify-out/graph.json` (to cite node labels).
- The user-selected target (god node or surprising connection).

If the user hasn't selected a target, ask before proceeding. Hypothesizing blind to the graph's signal produces the same incrementalist hypotheses the literature already has.

## The Process

For each candidate hypothesis, fill in all seven required sections below. If you cannot fill a section, the hypothesis isn't ready — iterate or kill it.

### 1. Claim (Falsifiable Form)

State the hypothesis as a single sentence containing:

- **Independent variable (X)** — computable, exactly specified (formula, instrument, units, lookback / measurement window).
- **Dependent variable (Y)** — what this predicts (magnitude of Y? probability of an event? rate of change?).
- **Sign** — positive, negative, U-shaped, monotone-conditional, etc.
- **Effect size ≥ E** — in SD, %, odds ratio, or raw units. Numeric, with a predicted range, not a point estimate.
- **Universe** — species, population, age range, disease/healthy status, inclusion/exclusion criteria.
- **Horizon** — time window over which the prediction holds.
- **Claim type** — **causal** or **correlational**. If causal, what would distinguish it from confounding.

Template:

> *A change of <X> on universe <U> predicts <Y> with sign <S> and effect size in the range <E_lo, E_hi> over horizon <H>. This is a <causal | correlational> claim; if causal, the distinguishing prediction vs. confounding is <...>.*

### 2. Mechanism

**Why should this be true?** Name the causal pathway. One of:

- **Biological** — molecular, cellular, organ-level, or system-level mechanism (e.g. SCFA → IL-6 → microglia → hippocampus).
- **Cognitive / psychological** — attention, memory, belief updating, emotion regulation.
- **Social / behavioural** — norms, incentives, information cascades, reinforcement.
- **Physical / chemical** — reaction kinetics, field dynamics, phase transitions.
- **Ecological / evolutionary** — selection pressure, niche dynamics, community assembly.

If you cannot name a mechanism, the hypothesis is an unexplained correlation — high false-positive risk from the replication crisis. Either find a mechanism or kill the hypothesis. Pattern-without-mechanism hypotheses are the single most common source of findings that fail to replicate.

The mechanism must be written at a level where a domain-expert reader can immediately imagine an experiment that would disrupt one link in the chain. *"Via inflammation"* is not a mechanism — it's a handwave. *"SCFA → GPR43 on gut epithelium → IL-6 → BBB → microglial M1 polarisation → hippocampal neurogenesis"* is a mechanism.

### 3. Predicted Effect Size & Direction

Numeric. Pre-specified. Set before outcome data is touched.

- **Point prediction** — a single best-guess number (e.g. β = -0.22 SD).
- **Prediction range** — a 50% CI around that point, based on prior effect sizes from the research doc.
- **Hit rate or power** — at this effect size, what sample size gives 80% power?
- **Capacity / generalization** — in what subpopulations would you expect the effect to hold? where would it weaken?

If your prediction is *"I don't know, let's see what the data says"* — you do not have a hypothesis. You have a fishing expedition. Fishing expeditions produce effect sizes that shrink by 50–80% on replication.

### 4. Falsifiability Criteria — What Kills This Hypothesis

**Write the kill conditions before running the experiment.** If the experiment produces any of these, the hypothesis is dead and must not be rescued by subgroup analysis, post-hoc covariate selection, or redefinition of the outcome.

- **Effect size below threshold** — e.g. *"observed β < 0.10 SD kills it"*
- **Wrong sign** — e.g. *"if β > 0 kills it"*
- **Confidence interval excludes the predicted range** — e.g. *"95% CI entirely below 0.10 kills it"*
- **Confound-survival failure** — e.g. *"if the effect disappears when diet quality is added as a covariate, kills the causal version; correlational version still lives"*
- **Population failure** — e.g. *"if the effect is only present in < 40yr subgroup, kills the general-adult claim; must refactor"*
- **Pre-registered comparison fails** — e.g. *"if pre-registered primary analysis is non-significant, the secondary analyses do not rescue it"*

Each kill criterion must be numeric. Phrases like *"if the effect is weaker than expected"* are not kill criteria.

### 5. Alternative Explanations to Rule Out

What else could produce this pattern in data without being the causal effect you claim?

- **Confounding** — a third variable causes both X and Y (e.g. diet causes both microbiome composition and depression).
- **Reverse causation** — Y causes X rather than the other way round (e.g. depression leads to diet changes which alter microbiome).
- **Selection bias** — the sample was selected in a way that induces the correlation (e.g. Biobank volunteers are healthier than the population).
- **Measurement artifact** — X and Y share a measurement instrument or rater, producing method-factor correlation.
- **Regression to the mean** — extreme baselines mechanically predict movement towards the mean.
- **File-drawer / publication bias** — your prior effect-size estimate came from the 5% of studies that passed peer review.
- **P-hacking in the literature** — the effect you're trying to replicate was itself a chance finding that survived garden-of-forking-paths analysis.
- **Ecological fallacy** — the effect is at the population level but does not hold at the individual level, or vice versa.
- **Ancestry / demographic confounding** — unmodelled population stratification produces spurious genotype-phenotype associations.

List at least **four** plausible alternatives. For each, write the specific design feature of the experiment that will rule it out. If you cannot name a ruling-out design, the alternative will remain viable after the experiment — note it as a *residual uncertainty* in the doc so the experimenter is warned.

### 6. Statistical Considerations

- **Sample size / power** — at the predicted effect size, what N gives 80% power with α = 0.05 (or the pre-registered α)?
- **Multiple-comparison correction** — if testing multiple variants of the hypothesis, apply Bonferroni, Benjamini-Hochberg, or a hierarchical model. Report the corrected threshold.
- **Pre-registration requirement** — this hypothesis must be pre-registered before outcome data is looked at. Name the registry (OSF, AsPredicted, clinicaltrials.gov) and the minimum fields that must be locked.
- **Missing-data plan** — for any expected missingness, specify multiple imputation, inverse-probability weighting, or a sensitivity analysis.
- **Positive / negative controls** — what positive control (a variable known to correlate with Y) and what negative control (a variable known NOT to) would validate the analysis pipeline?

### 7. Graph Lineage — Where This Came From

Every hypothesis must cite the graph lineage. This is what distinguishes *science* hypotheses from *vibes* hypotheses.

- **Graph target** — which god node or surprising connection this hypothesis tests. Quote the node label(s) from the graph.
- **Community context** — which community (or communities) the target belongs to.
- **Why this target** — one sentence on why this connection is worth testing *now* (what in the graph suggested it wasn't trivial).
- **Related graph neighbours that the experiment must account for** — other high-degree nodes connected to the target that could confound or mediate the predicted effect.

Example:

> *Graph target:* surprising connection between **"Shannon index"** (community 0: Microbiome measurement methods) and **"PHQ-9"** (community 1: Depression diagnostic instruments). The bridge has only one supporting edge in the corpus (Smith 2022), and the dominant link from community 1 outwards is to SCID-5, not PHQ-9. This is why we are testing PHQ-9 specifically rather than generalising across depression instruments.

## Output

Write to `{root}/docs/sci/<topic-slug>/hypotheses/YYYY-MM-DD-<name-slug>.md`:

```markdown
# Hypothesis: <short name>

**Date:** YYYY-MM-DD
**Upstream research:** docs/sci/<topic-slug>/research/YYYY-MM-DD-<topic-slug>.md
**Upstream graph reading:** docs/sci/<topic-slug>/graphs/YYYY-MM-DD-<topic-slug>.md
**Graph target:** <node label> [community <N>: <label>]
**Claim type:** causal | correlational

## 1. Claim (falsifiable)

<one sentence using the template above>

## 2. Mechanism

**Type:** biological | cognitive | social | physical | ecological
**Causal chain:** <step-by-step, named entities, no handwaves>
**Who (or what) is on the other side of the null hypothesis:** <what must be wrong in prior literature for this hypothesis to be novel>

## 3. Predicted effect size & direction

- Point prediction: <value + units>
- 50% prediction interval: <lo, hi>
- Sign: <positive | negative | other>
- Power analysis: at the predicted effect, N = <...> gives 80% power at α = <...>
- Expected heterogeneity: <subgroups where effect should hold; subgroups where it may weaken>

## 4. Falsifiability — these kill the hypothesis

1. <numeric condition>
2. <numeric condition>
3. <numeric condition>
4. <numeric condition>

## 5. Alternative explanations to rule out

| Alternative | How the experiment must rule it out | Residual uncertainty if not ruled out |
|-------------|-------------------------------------|---------------------------------------|
| Confounding by diet | <...> | <...> |
| Reverse causation | <...> | <...> |
| Measurement artifact | <...> | <...> |
| Selection bias | <...> | <...> |
| ... | ... | ... |

## 6. Statistical considerations

- Pre-registration: required at <OSF | AsPredicted | clinicaltrials.gov>; minimum locked fields: <primary outcome, analysis model, covariate list, missing-data plan, α>.
- Multiple-comparison correction: <method, corrected α>.
- Positive control: <variable> (known to correlate with Y).
- Negative control: <variable> (known NOT to correlate with Y).
- Missing-data plan: <multiple imputation | IPW | sensitivity analysis>.

## 7. Graph lineage

- **Graph target:** <node label>, community <N>: <label>.
- **Bridge type:** <god node | surprising connection | open dispute>.
- **Why test now:** <one sentence>.
- **Neighbours that could confound or mediate:** <list of node labels from the graph>.

## Next step

- If accepted: hand off to experimental design. The experiment must be pre-registered against this doc. Kill criteria are binding.
- If rejected: return to `sci-graphify` with user feedback (e.g. wrong target, mechanism too speculative), or to `sci-research` for more sources.
```

## Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "Let me just run the analysis and see" | That's not hypothesising, that's fishing. Fishing expeditions produce effect sizes that shrink 50–80% on replication. Predict first. |
| "I can't put a number on effect size without running the experiment" | The research doc gave you prior effect-size estimates. Pick a range. A wrong prior you revise is infinitely better than no prior. |
| "The mechanism is obvious — it just works" | Write it down. If you can't, you don't understand it. If you do, the write-up costs nothing. |
| "I've tested five variants and this one works best" | Bonferroni. Your multiple-testing-adjusted α is 5× smaller. Pre-register the family of tests or commit to one variant. |
| "The effect is strongest in subgroup X — let's focus there" | That's HARKing (Hypothesising After Results Known). Either pre-register the subgroup *before* looking, or treat the subgroup result as exploratory and require replication. |
| "Alternative explanations can be addressed in discussion" | They must be ruled out BY DESIGN, not hoped away in the discussion. Name each one now. |
| "The mechanism is hard to articulate but the pattern is real" | Patterns without mechanisms are the #1 source of failed replications. Articulate or kill. |
| "This single 2019 paper found β = 0.42 — let's predict the same" | A single paper has roughly 30–50% probability of being spurious, and effect sizes shrink on replication. Haircut your prior: predict β = 0.15–0.25, not 0.42. |
| "I'll let the data decide the sign" | Wrong. The sign is the hypothesis. Getting the sign free parameter is HARKing-lite and inflates Type I error dramatically. Commit or kill. |

## Anti-Patterns

### Unfalsifiable
*"X affects Y"* — no. A falsifiable hypothesis has numeric kill criteria whose occurrence would require you to retract the claim. If no result would kill it, it isn't a hypothesis.

### Pattern Without Mechanism
*"The 7-day average of X predicts next-day change in Y"* with no mechanism. High prior probability of data-mining artifact. Either find a mechanism or kill.

### Dual-Use of the Same Data
Hypothesis is generated from a dataset and then tested on the same dataset. Fix: hold out a replication cohort before any hypothesising, OR commit to using a fresh dataset, OR pre-register and wait for new data.

### HARKing (Hypothesising After Results Known)
Hypothesis is quietly reshaped to fit a result after the result is observed. Fix: lock the hypothesis before looking at the data; date-stamp the pre-registration.

### P-Hacker's Menu
Many analysis paths are possible, and one is chosen after seeing which produces significance. Fix: pre-register the exact analysis — covariates, outcome coding, inclusion rules, statistical test, α.

### Confounding-As-Discussion-Item
Writing *"confounding by diet cannot be ruled out"* in the discussion of an already-run experiment, instead of designing the experiment to rule it out. Fix: move it into §5 of the hypothesis doc so the experimental design has to account for it.

### Effect-Size Inflation
Predicting an effect size at the upper end of the prior literature because that's what would be publishable. Fix: predict the honest prior, haircut for replication/publication bias, and accept that smaller effect sizes need larger samples.

### Ignoring the Graph
Writing a hypothesis that doesn't cite any graph node or community — same as writing a hypothesis without reading the literature. Fix: every hypothesis must tag its graph target in §7.

### Bundling
Writing one hypothesis that tests multiple things ("X predicts Y, and also X predicts Z, and also Y mediates A→B"). Fix: one hypothesis per doc. Multiple related hypotheses = multiple docs, with a shared upstream graph reading.

## Handoff

When the hypothesis doc is complete, the sci-research-cycle terminates and the user hands off to experimental design (human or downstream skill). The hypothesis doc is the contract: the experiment must be pre-registered against it, and any deviation from the kill criteria means the hypothesis is dead. Do not rescue it with parameter tweaking — if the data falsifies the claim, write a replication report and return to `sci-research` with the failed result as a new gap.

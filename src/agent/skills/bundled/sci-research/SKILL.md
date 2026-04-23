---
name: sci-research
description: Use when starting a fresh scientific research question, before any hypothesis — surveys peer-reviewed literature, datasets, replication evidence, and methodological debates to build a sourced foundation with an explicit gap list. Saves raw materials to docs/sci/<topic-slug>/raw/ for the graph phase to ingest.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Sci Research

## Working directory

The agent's pinned working directory is `{root}`. Scientific artifacts live under `{root}/docs/sci/<topic-slug>/`, one directory per research project. Do not write research outputs outside this tree.

## The Rule

```
SOURCED FINDINGS. EXPLICIT GAPS. RAW MATERIALS ON DISK. NO HYPOTHESES YET.
```

The research phase produces a landscape of **what is known, by whom, with what level of evidence**. It does **not** produce hypotheses, predictions, or experimental designs. Those come in later phases. If you catch yourself writing *"this suggests we should test..."* — stop. That belongs in `sci-hypothesize`.

The phase has a second deliverable beyond the research doc: a folder of **raw materials** — abstracts, key passages, dataset cards, methodology notes — that the next phase (`sci-graphify`) will turn into a knowledge graph. A research doc without raw materials cannot be graphed. Save as you go.

## Inputs

- A research question from the user (e.g. *"is gut microbiome alpha-diversity causally linked to depression severity in adults?"*).
- If the question is vague, ask one focusing question before proceeding — e.g. *"are you interested in onset of depression, severity in already-depressed populations, or remission after treatment? And in what age range?"*

## The Process

### 1. Frame the Question

Write the refined question as the first line of the output doc. State what would count as evidence for and against the underlying claim — concretely, in terms of measurable variables.

### 2. Survey Peer-Reviewed Literature

Use `web_search_advanced_exa` with `category: "research paper"` and `web_search_exa` to surface:

- **Top-tier journals** for the field (e.g. *Nature*, *Science*, *Cell*, *NEJM*, *PNAS*, *JAMA*, *Lancet*, *PRL*, *RSI*).
- **Specialty journals** with high field-specific impact and credible peer review.
- **Preprints** on arXiv / bioRxiv / medRxiv / chemRxiv / SSRN — flag explicitly as *not yet peer-reviewed*.
- **Pre-registrations** on OSF / clinicaltrials.gov / AsPredicted — flag explicitly as *not yet completed*.
- **Systematic reviews and meta-analyses** — these update the prior on a body of literature; weigh more heavily than single primary studies.
- **Replication reports** — explicit replications (e.g. Many Labs, ManyBabies, Brian Nosek's group) — heavy weight, positive or negative.

For each source, extract: claim, methodology, sample size, effect size with CI, sign of result, replication status (replicated, conflicting, never tested), known caveats, conflicts of interest declared, data availability.

For broad questions, use `deep_researcher_start` / `deep_researcher_check` to fan out.

### 3. Survey Datasets and Methods

Many scientific questions hinge on the dataset and methodology choices upstream of any analysis. Document these explicitly:

- **Open datasets** that could be used to test the hypothesis (e.g. UK Biobank, MIMIC, OpenAlex, NHANES, GEO, ENA, PDB — adapt to field).
- **Standard methodologies** used to measure the variables of interest (and known limitations: e.g. stool 16S vs shotgun metagenomics for microbiome studies; PHQ-9 vs structured clinical interview for depression).
- **Known measurement artifacts** — anything that produces apparent effects without causal reality (e.g. batch effects, confounding by ancestry, regression to the mean, white-coat hypertension).
- **Replication initiatives' verdicts** if any apply to the methods — e.g. ManyLabs results on classic effects in social psychology; the credibility revolution in microbiome research.

### 4. Survey Existing Hypotheses and Mechanisms

What mechanisms have been proposed for the underlying phenomenon? Where does the field agree, where does it disagree?

- Named mechanistic models (cite by author/year/venue).
- Competing models — list them as alternatives, not as winners and losers.
- Disagreement is a feature, not a bug — flag conflicting findings as **OPEN DISPUTE** in the doc; the next phase will exploit them.

### 5. Save Raw Materials to Disk

For every source you cite, save a text-format artifact to `{root}/docs/sci/<topic-slug>/raw/`. The graph phase needs this corpus.

```bash
mkdir -p {root}/docs/sci/<topic-slug>/{raw,research,graphs,hypotheses}
```

Per source, write one of:

- **Abstract + key passages** as a markdown file: `{root}/docs/sci/<topic-slug>/raw/<short-id>.md` with frontmatter:
  ```markdown
  ---
  source_url: https://...
  captured_at: 2026-04-21
  author: Smith et al.
  venue: Nature
  year: 2024
  tier: A
  type: paper | preprint | review | meta-analysis | replication | dataset | method
  ---
  # <Title>
  Abstract: ...
  Key passages: ...
  Effect size reported: ...
  Caveats: ...
  ```
- **Dataset cards** as markdown files describing what the dataset measures, who collected it, known biases.
- **Method notes** as markdown files describing a methodology, its assumptions, and its known failure modes.
- **PDFs** can be saved alongside (`{root}/docs/sci/<topic-slug>/raw/<short-id>.pdf`) but are optional — the markdown abstract is what graphify will primarily ingest.

If `web_search_exa` returns full content, save the relevant excerpt — do not just save the URL. The graph cannot be built from URLs alone.

**Minimum: 5 raw-material files** before declaring the research phase complete. Below 5, the graph will be too sparse to produce useful communities.

### 6. Rate Every Source

For each source in the output doc, rate quality:

| Tier | Source type |
|------|-------------|
| A | Top-tier peer-reviewed journal **with at least one independent replication** |
| B | Peer-reviewed primary study from credible journal, no replication yet |
| C | Preprint from credible group with disclosed methodology and open data |
| D | Industry report / well-documented technical blog |
| E | Press release / news article / anonymous forum post / opinion piece |

- A is the only tier that can stand alone as evidence.
- B and C should be cited together with at least one other source (or flagged as *single-source claim*).
- D and E are for context only, never as evidence. Cite them as *signal of public attention* or *signal of methodological norms in industry*.

### 7. Enumerate Gaps

The *Gaps* section is mandatory. It is the most useful output of this phase for the next two phases.

- What questions does the literature NOT answer?
- Where does the literature contradict itself?
- What populations / ecosystems / conditions / regimes are underrepresented?
- What measurement methods have not been compared head-to-head?
- What mechanisms are proposed but never directly tested?

No gaps found = you did not look hard enough. Go back to step 2.

## Output

Write to `{root}/docs/sci/<topic-slug>/research/YYYY-MM-DD-<topic-slug>.md` with this structure:

```markdown
# Research: <topic>

**Date:** YYYY-MM-DD
**Research question:** <one-sentence, specific>
**Field:** <e.g. microbiome × psychiatry>

## What would count as evidence

- For:    <concrete, observable, measurable — variable + direction + magnitude>
- Against: <concrete, observable, measurable>

## Key findings

### From peer-reviewed literature
- Finding 1 [A-tier, Smith et al. 2022 Nature; replicated by Jones 2023] — <claim, effect size with CI, caveat>
- Finding 2 [B-tier, Lee 2024 J Psych] — <...>
- Finding 3 [C-tier, preprint, Doe 2025 bioRxiv] — <...>

### From datasets and methods
- <Dataset/method name> — <what it measures, known limitations relevant to this question>

### From competing mechanisms
- Mechanism A (Smith hypothesis) — <description, evidence for, evidence against>
- Mechanism B (Jones hypothesis) — <description, evidence for, evidence against>
- **OPEN DISPUTE:** <where the field disagrees and why it matters here>

## Sources (rated)

| Source | Tier | Replication status | Relevance |
|--------|------|--------------------|-----------|
| <citation / URL> | A | Replicated × 2 | <one-line summary> |
| ... | ... | ... | ... |

## Raw materials saved

Files in `{root}/docs/sci/<topic-slug>/raw/`:
- `smith-2022.md` — Smith et al. 2022 Nature, abstract + Fig. 3 caption
- `jones-2023-replication.md` — Jones 2023 replication report
- `<dataset-name>.md` — dataset card
- ... (must be ≥ 5)

## Gaps (open questions)

1. <Specific unanswered question — what experiment would resolve it?>
2. <...>
3. <...>

## Known measurement and reproducibility risks

- <e.g. PHQ-9 has poor test-retest reliability under repeat administration → use SCID-5 instead>
- <e.g. batch effects in 16S rRNA sequencing across studies → meta-analyses must adjust>
- <e.g. ascertainment bias in UK Biobank toward healthy adults>
```

## Rationalization Table

If you hear yourself thinking these, STOP. You are not doing research — you are doing motivated reasoning.

| Rationalization | Reality |
|-----------------|---------|
| "Let me just jump ahead — I already know what the hypothesis will be" | Then writing the gaps section will be trivial. Do it first. Research tells you whether your intuition survives contact with the prior literature. |
| "Three blog posts and a Twitter thread say this works, that's enough" | Tier D/E. You need at least one Tier A or two converging Tier B/C sources, or you are building on sand. |
| "The paper disagrees with my intuition, but its sample was different" | That's the gap. Write it as a gap, not as a reason to dismiss the paper. |
| "This is just a quick check, I don't need raw materials saved" | Without raw materials on disk, the graph phase has nothing to ingest. Save as you go. |
| "Topic is too new for there to be relevant literature" | Adjacent literatures (related organisms, related diseases, related methods) almost always apply. Look wider. |
| "I'll skip the methodology section, the methods are obvious" | Write it anyway. Half the replication failures in the field came from undocumented methodology drift. The graph will surface methodology nodes you missed. |
| "The press release covered it, I trust the underlying finding" | Press releases overstate effect sizes 2–10×. Find the paper. Read the methods. |
| "This single 2019 paper has Sharpe 2.1-equivalent effect size — let's go" | A single paper has roughly 30–50% probability of being spurious. Find a replication or treat the claim as preliminary. |

## Anti-Patterns

### Confirmation Bias
Citing only sources that agree with a pre-existing intuition. Fix: for every claim accepted, name one credible source that disagrees (or write *"no disagreement found in literature reviewed"* and explain why).

### Press-Release-As-Authority
Citing a Tier E source (news article, university press release) as evidence. Fix: trace back to the paper, read the methods, cite the paper directly. The press release is at best a discovery aid.

### Missing Replication Status
Citing a finding without noting whether it has been replicated. Fix: for every Tier A/B claim, mark *"replicated × N"*, *"failed replication"*, *"never tested"*, or *"replication in progress"*. Without this, the experimenter cannot calibrate priors.

### No Gap Enumeration
Writing a research doc that reads *"the literature is converging, the answer is X"*. Fix: if no gaps exist, the question is solved and there is nothing to hypothesize. Either find gaps or escalate to the user that this is a settled question.

### Empty Raw-Materials Folder
Writing a research doc that cites 30 sources but saved zero raw materials to disk. Fix: as you cite, save. The graph phase needs text on disk, not URLs in a doc.

### Scope Creep
Turning *"is microbiome diversity linked to depression severity?"* into a survey of all gut-brain-axis literature. Fix: respect the scope of the question. Note adjacencies as *Related Work*, not as findings.

### Conflating Correlation with Causation
Writing *"X causes Y"* in a finding row when the cited study only showed *"X is associated with Y"*. Fix: copy the original phrasing exactly. Mark *causal* vs *correlational* explicitly.

## What Gets Cited

- Paper title, authors, year, venue, DOI/URL.
- For preprints: server, post date, version number.
- For datasets: name, version, accession ID, governance body.
- For local files: full path under `{root}/docs/sci/<topic-slug>/raw/`.
- No "various sources" or "consensus opinion". Every claim has a cite or is flagged as *unverified*.

## Handoff

When the output doc is complete AND `{root}/docs/sci/<topic-slug>/raw/` has at least 5 files, the cycle proceeds to `sci-graphify`. The raw-materials folder is the input the graph phase ingests; the gap section is what the hypothesis phase will eventually exploit. Both must be in good shape before handoff.

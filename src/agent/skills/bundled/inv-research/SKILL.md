---
name: inv-research
description: Use to drill one investigative thread of a non-scientific topic — aggregates journalistic, archival, podcast, blog, and primary-document sources; verifies each non-trivial claim by tracing to primary, checking speaker track record, and triangulating across ≥3 bias-spectrum vantage points. Per-round depth cap of 3 nested sub-questions; soft floor of ≥20 distinct searches per round. Outputs research/rN.md with Search log, Spectrum coverage, and Claim Cards; extends investigation-log.md with the round's new layers.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Inv Research

## Working directory

The agent's pinned working directory is `{root}`. Investigative artifacts live under `{root}/docs/inv/<topic-slug>/`, one directory per project. Do not write outside this tree.

## The Rule

```
TRACE TO PRIMARY. CHECK THE SPEAKER. TRIANGULATE THE CLAIM. SWEEP THE SPECTRUM. DOCUMENT WHAT'S HIDDEN AND WHAT'S CONTESTED.
```

This phase aggregates sources of all credibility tiers — journalism (mainstream and independent), podcast and interview transcripts, blogs, books, archival primary documents, court records, FOIA releases, contemporaneous press — and verifies each non-trivial claim itself, because there is no peer review to outsource gatekeeping to.

It does **not** produce a polished investigative report. That is `inv-report`, opt-in. This phase produces the round's research notes: a Search log, Spectrum coverage table, and a ledger of Claim Cards (one per non-trivial factual claim) that downstream phases consume.

## Inputs

- **Thread (required):** the question this round drills.
  - Round 1: the user's original investigative question.
  - Round ≥ 2: the user-picked area from the prior round's `synthesis/r<N-1>.md` ranked proposals.
- **Round number `N` (required, integer ≥ 1):** passed in by `inv-research-cycle`. Used to write outputs to `research/rN.md`.
- **Topic slug:** the project directory under `{root}/docs/inv/`.
- If the thread is vague (round 1 only), ask one focusing question — e.g. *"are you asking about the original 1886 formula or the New Coke / Classic relationship?"* Do not ask focusing questions on rounds ≥ 2; the thread came from synthesize and is precise.

## Investigation log — multi-axial

The phase builds a multi-axial investigation log on disk in `{root}/docs/inv/<topic-slug>/investigation-log.md`. Each leaf is tagged with one of six axes:

| Axis | Question shape | Example |
|---|---|---|
| **Origin** | Where did this come from? | Why was Coca-Cola's formula sealed? |
| **Actor** | Who's involved, what are their motives/credentials? | Who actually wrote the Book of Enoch? |
| **Document** | What does the primary record say (vs. derivative reports)? | How does Aramaic Enoch differ from the Ge'ez translation? |
| **Timing** | When did this claim first appear? | When did "Coca-Cola once contained cocaine" first get reported? |
| **Counter** | What does the opposing camp say? | What do bibliometric scholars say against canonical Enoch dating? |
| **Adjacent** | What related topic is load-bearing here? | What were the other Qumran scrolls? |

**Per-round depth cap: 3 nested sub-questions.** When the cap hits, leave non-terminal leaves as Investigated — the user can opt to drill further on a later round.

### Leaf states

| State | Meaning | When to mark |
|---|---|---|
| **Investigated** | Default. Sourced explanation exists; not terminal. | Common case. |
| **Established** | Multi-source primary-corroborated; no active dispute. | Use when ≥2 independent sources (≥1 primary) converge and no credible dispute exists. |
| **Common knowledge** | Widely known / definitional / public record. | Mark if explaining further would feel pedantic to anyone who'd read this report. |
| **Contested** | Sources actively disagree; document each side. | Use when credible sources on multiple sides hold incompatible positions. The disagreement is the answer. |
| **Hidden** | A truth exists but is concealed (trade secret, classified, lost to history). Document the boundary. | Use when the claim has a real referent but its content is unreachable (Coca-Cola formula vault; redacted classified material). Distinct from Under-investigated. |
| **Speculative** | Only speculation/rumor; no verifiable information despite thorough search. | Use when the topic exists but no primary or corroborated source supports any specific account (e.g., specific UFO sightings with no primary document). |
| **Under-investigated** | ≥6 search strategies tried; little or nothing found. | Use when search came up empty across keyword + synonym + adjacent + archive + spectrum-sweep. Document the strategies tried. |

**Calibration:** default to Investigated. Promote to a terminal state only when criteria are clearly met. Over-marking terminal states truncates productive lines.

### Drilling procedure (round N)

1. **Identify the entry node** in `investigation-log.md`:
   - Round 1: create root `Q0: <topic> [<one-line scope statement>]`. Entry node is Q0.
   - Round ≥ 2: find the existing node matching the input thread (by node ID or fuzzy text match). If no match, append a new top-level branch under Q0 noting the round it was added.
2. **Layer 1:** answer the entry-node question. Tag with axis. Classify the leaf.
3. **Layer 2:** if Layer 1 leaf is Investigated, formulate the next sub-question. Tag with axis. Classify.
4. **Layer 3:** if Layer 2 leaf is Investigated, formulate the third. Classify.
5. **Stop at 3 layers** even if leaves are still Investigated. Synthesize prompts the user.

### Updating `investigation-log.md`

Append the round's new sub-tree to `{root}/docs/inv/<topic-slug>/investigation-log.md`. Format:

```
Q0: <topic> [<scope statement>]
├── Q1.1 [Actor] [round 1] [Investigated]: <one-line summary> — sources: P × 2, C × 4, R × 1
│   ├── Q2.1 [Document] [round 2] [Established]: <summary> — primary: <citation>
│   └── Q2.2 [Counter] [round 2] [Contested]: <summary> — pro: <cites>; con: <cites>
```

Each leaf line: axis tag, round added, terminal state, source-tier counts, citation hooks.

If `investigation-log.md` does not exist (round 1), create it with `Q0:` as the root.

## Source credibility framework

For every source, record:

| Dimension | Examples |
|---|---|
| Type | primary document / archive / established journalism / independent journalist / practitioner-expert / podcast or interview / blog / forum / anonymous |
| Track record | retraction history, specialist credibility on this topic, fabrication history; "unknown" if untraceable |
| Triangulation | corroborated by N independent sources |
| Distance from event | contemporaneous / retrospective / second-hand / third-hand |
| Recency | year — and whether recency matters for this topic |
| Primary vs derivative | original vs. someone reporting on it |
| Bias direction | political/ideological lean, financial conflict, fan/skeptic community |

**Tier system** (replaces sci-research's A-E):

| Tier | Description |
|---|---|
| **P** | Primary — original document / direct testimony / contemporaneous record |
| **C** | Corroborated — multiple independent secondary sources converging |
| **R** | Reported — single secondary source with track record |
| **A** | Asserted — single source, no track record verifiable; flagged |
| **D** | Disputed — sources actively contradict; both sides documented |

Anonymous unverifiable claims are not tiered — they are documented as `[uncorroborated]` and never load-bearing.

## Per-claim verification protocol

For every non-trivial factual claim:

1. **Trace to primary.** If "X said Y on the Z podcast", find Y said by X — listen/read the original, not the article about it. If primary is unreachable, mark `[primary-unreachable]`.
2. **Check speaker track record.** Search explicitly: has X been caught fabricating? Specialist credibility on this topic? 1-2 lines on what you found.
3. **Triangulate.** Find ≥2 independent sources, preferably across the bias spectrum. Mark independence — two outlets running the same wire story aren't independent.
4. **Tag the claim** in its Card:
   - `corroborated` — ≥2 independent sources, one primary
   - `asserted` — single source, primary
   - `reported` — single source, derivative
   - `contested` — sources disagree
   - `uncorroborated` — no independent verification possible

## Search behavior

### Per-round budget — ≥20 distinct queries

Tracked in a `Search log` section of `research/rN.md` so the user (and future-you on resume) can see what was tried. Variation required across:

- **Keywords** — synonyms, antonyms (search for the thing AND for what would refute it), domain jargon, layperson framing
- **Time windows** — for historical topics, search early/middle/late phases of the topic separately
- **Source types** — Exa advanced category sweeps for `news article`, `pdf`, `personal site`, `tweet`, `company`
- **Bias-spectrum vantage points** — see below
- **Primary-source archives** — see below

### Bias-spectrum sweep — mandatory when topic has a spectrum

Force ≥3 distinct vantage points per round:

- **Mainstream / institutional** — established outlets (NYT, WSJ, BBC, Reuters, AP, AFP) and academic/expert consensus
- **Independent / critical** — Substack, ProPublica, niche specialist blogs with track record, opposing-side outlets
- **Primary** — court records, FOIA releases, government docs, contemporaneous press, original audio/transcripts
- **Community / believer / skeptic** (when applicable) — the topic's own subculture: UFO disclosure community, biblical-scholar forums, ex-employees, fans/critics

`research/rN.md` must include a "Spectrum coverage" subsection naming which vantage points were reached and what was tried for any that weren't.

### Primary-source archives the skill explicitly knows to try

Priority order:

1. **Internet Archive** (archive.org, web.archive.org) — books, audio, video, dead-link recovery
2. **Government primary sources** — govinfo.gov, foia.gov, congressional records, regulatory filings (SEC EDGAR, FCC, FDA)
3. **Court records** — CourtListener, RECAP, case transcripts, depositions
4. **FOIA collections** — MuckRock, Black Vault (UFO/intelligence), National Security Archive
5. **Specialized archives** — JSTOR (some open), arXiv, Wikileaks, archive.org manuscript collections
6. **Wikipedia** — *only* as citation discovery, never as citation itself. Mine references, then go to primary.

### Podcast / interview hunting

- Search `"<show name>" "<guest name>" transcript` directly
- YouTube auto-captions are searchable via Exa
- For named guests with track records, search guest+topic to find prior corroborating or contradicting statements
- Reddit fan transcriptions as breadcrumbs (flag as derivative; follow back to original timestamp)

### Searching tools

Use:

- `web_search_exa` — catch-all keyword search
- `web_search_advanced_exa` with `category` — `news article`, `personal site`, `pdf`, `company`, `tweet`
- `deep_researcher_start` / `deep_researcher_check` — for broad / underexplored topics, fan-out

## Save raw materials to disk

For every cited source, save a text-format artifact to `{root}/docs/inv/<topic-slug>/raw/`. The graph phase needs this corpus.

```bash
mkdir -p {root}/docs/inv/<topic-slug>/{raw,research,graphs,answers,synthesis,reports}
```

Per source, write a markdown file `{root}/docs/inv/<topic-slug>/raw/<short-id>.md` with frontmatter:

```markdown
---
source_url: https://...
captured_at: YYYY-MM-DD
author: <person or outlet>
venue: <publication / show / archive>
year: <year>
type: primary | journalism | independent | podcast | book | blog | forum | anonymous
bias_spectrum: mainstream | independent-critical | primary | community-believer | community-skeptic | n/a
tier: P | C | R | A | D
track_record: <1 line — verified / mixed / fabrication-history / unknown>
---
# <Title>
<Captured content — the relevant passage, transcript excerpt, document quote, etc. Save the actual text, not just the URL.>
```

**Cumulative minimum: 5 raw-material files** before the round can declare itself complete. Below that, the graph will be too sparse.

## Output

Write to `{root}/docs/inv/<topic-slug>/research/rN.md` with this structure:

```markdown
# Research round N: <thread>

**Date:** YYYY-MM-DD
**Thread researched this round:** <thread>
**Round entry node in investigation-log:** <node ID>

## What would count as evidence

- Strong support: <observable facts that, if true, would settle the question one way>
- Strong refutation: <observable facts that would settle it the other way>

## Search log

| # | Query | Tool / category | Spectrum vantage | Result summary |
|---|-------|-----------------|------------------|----------------|
| 1 | "<query string>" | web_search_exa | mainstream | <key sources surfaced> |
| 2 | "<query string>" | web_search_advanced_exa / news article | independent | <...> |
| ... | ... | ... | ... | ... |

(Aim for ≥20 entries.)

## Spectrum coverage

| Vantage point | Reached? | Notes |
|---------------|----------|-------|
| Mainstream / institutional | ✓ | <which outlets> |
| Independent / critical | ✓ | <which outlets> |
| Primary archives | ✓ | <which archives queried, what was found> |
| Community / believer / skeptic | <✓ or ✗> | <if ✗, what was tried> |

≥3 must be ✓ before the round is complete.

## Claim Cards

### CC-N.1: <one-line claim>
- **First source seen**: <citation, type>
- **Primary traced**: yes / no / unreachable [<note>]
- **Speaker track-record check**: <1-2 lines>
- **Triangulation**: <list of independent sources, with bias-spectrum tag for each>
- **Tag**: P | C | R | A | D — corroborated | asserted | reported | contested | uncorroborated
- **Notes**: <anything that affects how to weight this claim downstream>

### CC-N.2: <...>
...

(Aim for ≥10 cards on a moderately-investigated topic. Below 5, the round is a stub — flag to user.)

## Open disputes encountered

- <named dispute, sides, key sources for each side, why it matters>

## Hidden / inaccessible (boundary notes)

- <claim that has a real referent but couldn't be reached — note what's known about the boundary, e.g. "court documents under seal until 2030">

## Gaps (open questions)

1. <Specific unanswered question — what investigative path would resolve it?>
2. <...>
3. <...>

## Round metrics

- Searches logged: <N> (target ≥ 20)
- Spectrum points reached: <N> (target ≥ 3)
- Sources captured to raw/: <N> this round; <M> cumulative (cumulative ≥ 5)
- Claim cards added: <N> (target ≥ 10)
```

**In addition,** ensure `{root}/docs/inv/<topic-slug>/investigation-log.md` is updated per the "Updating `investigation-log.md`" instructions in the Investigation log section above. If you finish this round without writing to investigation-log.md, the round is not complete.

## Hard Rules

- **Do not produce a hypothesis.** That isn't this skill's job. The output is research notes — sourced, verified, classified.
- **Do not advocate.** Document what's established, contested, hidden, speculative. Do not endorse a side.
- **Do not skip primary tracing.** Every non-trivial claim that has a primary must be traced to it. If unreachable, mark — don't paper over.
- **Do not skip the spectrum sweep when the topic has a spectrum.** ≥3 vantage points is the floor.
- **Wikipedia is not a citation.** Use it for reference discovery only.
- **Anonymous claims are documented but never load-bearing.** They appear in the report tagged `[uncorroborated]`.

## Anti-Patterns

### Single-source confidence
Treating one well-written article as evidence. Fix: triangulate before tagging anything corroborated. A wire-service quote that ran in 12 outlets is still one source.

### Source-laundering
Treating a citation chain that bottoms out at one primary as if each link in the chain were independent corroboration. Fix: track derived_from explicitly. Three reports about a single Snowden document are one source, not three.

### Spectrum dodge
Searching only mainstream outlets for a contested topic. Fix: explicit independent / opposing-community searches per round. Spectrum coverage is mandatory.

### Speaker-credentialing-by-affiliation
"X is a Yale professor, therefore X's claim is credible" — without checking X's track record on this specific topic. Fix: explicit track-record search per claim.

### Pattern-without-archive
Claiming an event occurred without finding any primary archive (court record, contemporaneous press, FOIA release). Fix: search archives explicitly. If no primary exists, tag the claim `[primary-unreachable]` or `Speculative`.

### Truncated drilling
Stopping at Layer 1 because "the claim is well-established". Fix: drill at least one layer below to surface the mechanism / origin / counter-narrative. Three layers is the cap, not the target — but "the claim is well-known" rarely justifies stopping at one.

### Hidden ≠ Under-investigated
Marking a leaf `Hidden` when the search just wasn't thorough. Fix: `Hidden` requires evidence the truth exists but is concealed (sealed records, NDA-protected, redacted). When in doubt, mark `Under-investigated` and document what was tried.

## Handoff

When this round's work is complete, the following must be on disk:

- `{root}/docs/inv/<topic-slug>/research/rN.md` — survey doc with Search log, Spectrum coverage, Claim Cards, Gaps.
- `{root}/docs/inv/<topic-slug>/raw/` — populated with at least 5 source files **cumulatively**.
- `{root}/docs/inv/<topic-slug>/investigation-log.md` — extended with this round's new layers and leaf states.

The orchestrator (`inv-research-cycle`) then proceeds to `inv-graphify` for this round, followed by `inv-synthesize`. This skill does not invoke either of those.

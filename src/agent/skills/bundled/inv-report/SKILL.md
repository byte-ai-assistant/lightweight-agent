---
name: inv-report
description: Use only when the user explicitly opts in to compiling a long-form investigative report — this is never auto-triggered after a research round. Consumes the cumulative answer (docs/inv/<topic-slug>/answer.md), the investigation-log, the latest round's graph (docs/inv/<topic-slug>/graphs/rN/), and all Claim Cards across rounds. Produces a polished journalistic write-up at docs/inv/<topic-slug>/reports/YYYY-MM-DD-<name>.md with narrative arc, source-spectrum audit, and full citations.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Inv Report

## Working directory

The agent's pinned working directory is `{root}`. Investigative artifacts live under `{root}/docs/inv/<topic-slug>/`. Write the report to that project's `reports/` subfolder.

## Invocation

This skill is **opt-in only**. It is never invoked automatically by `inv-research-cycle`. The `inv-agent` dispatcher routes to it only when the user explicitly says "compile report" / "write the investigative report" / "give me the full write-up" or similar. If you find yourself running this skill without an explicit user request, STOP — return control to the orchestrator.

## The Rule

```
NARRATIVE ARC. NAMED CHARACTERS. SOURCED EVERY CLAIM. BIAS-SPECTRUM AUDIT. CONCLUSIONS WHERE THE EVIDENCE SUPPORTS THEM, OPEN ENDS WHERE IT DOESN'T.
```

The report is the long-form artifact a reader actually wants to read — different from `answer.md` (running research notes). It has a lede, named characters, framing, scenes, and a journalistic structure. It does not advocate; it documents what's established, contested, hidden, and speculative — and lets the reader draw their own conclusions where the record supports more than one.

## Inputs

- **The cumulative answer:** `{root}/docs/inv/<topic-slug>/answer.md` — the running answer produced by `inv-synthesize` across all rounds.
- **The investigation log:** `{root}/docs/inv/<topic-slug>/investigation-log.md` — the multi-axial leaf tree.
- **All Claim Cards:** every `### CC-N.M` entry across `research/r1.md`, `research/r2.md`, … (every round). These are the project's evidence database.
- **The latest graph reading + artifacts:** `{root}/docs/inv/<topic-slug>/graphs/rN.md` and `{root}/docs/inv/<topic-slug>/graphs/rN/`.
- **All raw materials:** `{root}/docs/inv/<topic-slug>/raw/` — for direct quote retrieval.

If `answer.md` does not exist, STOP and route the user to `inv-research-cycle` first. The report needs at least one completed round.

## Process

### 1. Load all evidence

Read every Claim Card across all rounds. Build a mental ledger keyed by claim:
- Which CCs corroborate this?
- Which contest it?
- What's the highest-tier source (P > C > R > A)?
- What's the bias-spectrum coverage?

The ledger is the source of truth for the report. No claim appears in the report that doesn't trace to a CC.

### 2. Draft the narrative arc

Decide the report's framing — what's the through-line that turns the topic into a story? Common shapes:

- **Origin → controversy → unresolved questions** (good for "the story of X")
- **Claim → contested evidence → what's actually known** (good for "is it true that X?")
- **Mystery → primary sources → the boundary of knowledge** (good for "what really happened with X?")
- **Person → trail → reckoning** (good for actor-centric topics)

Pick one. Write a one-paragraph lede that previews it.

### 3. Write the report

Output to `{root}/docs/inv/<topic-slug>/reports/YYYY-MM-DD-<name-slug>.md`:

```markdown
# <Topic>: <one-line framing>

**Date:** YYYY-MM-DD
**Topic:** docs/inv/<topic-slug>/
**Rounds informed by:** <list, e.g. r1-r4>
**Upstream cumulative answer:** docs/inv/<topic-slug>/answer.md

## The question

<the original prompt + scope clarification — what this report does and does not cover>

## What we know

<2-5 paragraphs of sourced narrative. The corroborated and primary-traced parts of the story. Names, dates, places, primary documents. Cite sources inline by short id (NYT 2014, FOIA-2020-XYZ, Smith podcast 2023); the full citation table at the end has details. Distinguish primary-traced claims from reported-only ones if the distinction matters for the reader's calibration.>

## Where it's contested

<For each major dispute: a sub-section.>

### <named dispute>

<2-3 paragraphs documenting each side. Both sides cited at the same level of source quality if possible. Reader leaves understanding why people disagree — not who's right.>

### <named dispute>

<...>

## Where it's hidden

<For each genuinely concealed truth — trade secret, sealed records, classified, lost archive: name what's known about the boundary. What we can verify exists; what we cannot reach.>

## Where it's speculative

<Rumor, legend, fan theory. Clearly tagged. State what would have to be true for any specific account to be supported, and why the verifiable record doesn't yet support it.>

## Source spectrum audit

| Claim category | Mainstream | Independent | Primary | Community |
|----------------|------------|-------------|---------|-----------|
| Corroborated across spectrum | <count or list> | ✓ | ✓ | <...> |
| Mainstream-only | <count or list> | <...> | <...> | <...> |
| Primary-only (yet to be picked up) | <...> | <...> | <count> | <...> |
| Community-only (uncorroborated by mainstream) | <...> | <...> | <...> | <count> |

This table answers: which claims hold across the spectrum (high-confidence) and which depend on a single perspective (lower-confidence)?

## Open threads

<3-5 specific investigative paths a future round (or a different investigator) could push on. Same shape as `synthesis/rN.md` next-areas, but framed for a reader picking up the topic later.>

## Conclusions

<Where evidence supports a clear answer, state it — sourced. Where evidence supports more than one answer, name the open question and the conditions under which it would resolve. Do not force a conclusion the record doesn't support.>

## Citations

| Short id | Full citation | Tier | Type | Track record | Bias spectrum |
|----------|---------------|------|------|--------------|---------------|
| NYT 2014 | "Headline", New York Times, 2014-MM-DD, URL | C | journalism | strong | mainstream |
| FOIA-2020-XYZ | FOIA release XYZ, archive.gov/..., 2020 | P | primary | n/a | primary |
| Smith podcast 2023 | Smith Show, ep. 234 with Guest, transcript URL, 2023 | R | podcast | mixed (see notes) | community |
| ... | ... | ... | ... | ... | ... |

## Boundary statement

<One paragraph: what this report doesn't cover (out of scope), what's known to be missing (sources we couldn't access), and what would change the picture if it surfaced. This is for the reader's calibration — what would falsify or substantially update the story?>
```

### 4. Quality checklist before saving

- [ ] Every claim in "What we know" traces to ≥1 Claim Card with tier P or C.
- [ ] Every entry in "Where it's contested" has both sides cited at comparable source quality.
- [ ] Every "Hidden" entry names the specific boundary (sealed-until, classified, vault, lost).
- [ ] Every "Speculative" entry says what would have to be true for any specific account to hold.
- [ ] The Source spectrum audit table is filled out — not skipped.
- [ ] Citations table has every source referenced inline.
- [ ] Boundary statement names what would update the picture.

If any check fails, fix before writing the file.

## Hard Rules

- **Do not advocate.** Document. Where evidence supports a conclusion, state it cited; where it doesn't, name the open question.
- **Every claim cites.** No "various sources" or "consensus opinion". A claim without a citation in the table is unverified — flag explicitly or remove.
- **Primary tier when reachable.** If a claim has a primary source, cite the primary, not the article about it.
- **No new research.** This skill compiles what `inv-research` already gathered. If a key claim has no Claim Card, surface that as a gap in "Open threads" — do not invent the citation.
- **Bias-spectrum audit is mandatory.** The table makes the report's shape transparent to the reader.

## Anti-Patterns

### Implicit advocacy
Adopting one side's framing or vocabulary throughout. Fix: read the draft asking "would the other side recognize this as a fair description?". Where they wouldn't, neutralize.

### Opinion as conclusion
Closing the report with "and clearly the truth is X" without the citation chain to back it. Fix: state conclusions only where the cited evidence forces them. Where it doesn't, name the open question.

### Citation laundering
Citing one source three different ways to make a single source look like corroboration. Fix: independence comes from the sources, not from the citations. Use the Claim Card ledger to verify independence before claiming corroboration in the report.

### Boundary erosion
Stating something as known when the record only supports it on one side of a documented dispute. Fix: anything that's `Contested` in the investigation log goes in the "Where it's contested" section, not "What we know".

### Padding with the obvious
Filling "What we know" with common-knowledge claims to inflate apparent depth. Fix: common-knowledge claims belong in a brief framing paragraph, not as load-bearing content. The report's value is in the sourced specifics.

## Output filename and re-runs

Filename pattern: `{root}/docs/inv/<topic-slug>/reports/YYYY-MM-DD-<name-slug>.md` where `<name-slug>` is a short kebab-case description of the report's framing.

The user can re-invoke this skill after additional rounds to produce an updated dated version. The prior reports stay on disk — they document the state of the investigation at the time they were written.

## Handoff

When the report is written, print:

```
INVESTIGATIVE REPORT WRITTEN. {root}/docs/inv/<topic-slug>/reports/<file>.md is ready.

The report is the project's polished long-form artifact at this round. The
running answer (answer.md), claim cards (research/rN.md), and investigation
log (investigation-log.md) remain on disk and continue to grow if more
rounds are run later.

If new rounds shift the picture materially, the user can re-invoke this skill
to produce an updated dated version. Prior reports stay on disk as a record
of how the investigation evolved.
```

Then EXIT. Do not invoke any further skill.

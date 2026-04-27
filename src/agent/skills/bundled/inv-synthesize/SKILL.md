---
name: inv-synthesize
description: Use after inv-research and inv-graphify complete a round — synthesizes the round's findings into (1) a cumulative answer.md that integrates the new layer, (2) a frozen answers/rN.md snapshot, (3) a synthesis/rN.md round summary with 3-5 ranked next-area proposals for the user gate. Updates investigation-log.md leaf states. Never compiles the long-form investigative report — that is opt-in via inv-report.
---

# Inv Synthesize

## Working directory

The agent's pinned working directory is `{root}`. Synthesis artifacts live under `{root}/docs/inv/<topic-slug>/`. Do not write outside this tree.

## The Rule

```
INTEGRATE THE NEW LAYER. RANK NEXT AREAS. PRESENT THE GATE. NEVER COMPILE THE FINAL REPORT.
```

This phase reads the round's research doc + graph reading + investigation-log, and produces three artifacts:

1. **`answers/rN.md`** — frozen per-round snapshot. What we know after this round, written as if this round were the last. Never edited later.
2. **`answer.md`** — the running cumulative answer, rewritten this round to integrate the new layer with the prior layers.
3. **`synthesis/rN.md`** — the round summary + 3-5 ranked next-area proposals presented at the user gate.

Synthesis does **not** compile the long-form investigative report. If the user wants the polished report, the dispatcher routes them to `inv-report`.

## Inputs

- Round number `N` (integer ≥ 1) — passed in by `inv-research-cycle`.
- Topic slug — the project directory under `{root}/docs/inv/`.
- The thread that was researched this round (the original question for round 1; user-picked area for rounds ≥ 2).
- `{root}/docs/inv/<topic-slug>/research/rN.md` — this round's literature survey.
- `{root}/docs/inv/<topic-slug>/graphs/rN/` — this round's graph artifacts (graph.json, GRAPH_REPORT.md).
- `{root}/docs/inv/<topic-slug>/investigation-log.md` — the why-tree, already updated by `inv-research` with the new layer's leaves.
- `{root}/docs/inv/<topic-slug>/answer.md` (if exists; absent for round 1) — prior cumulative answer.
- `{root}/docs/inv/<topic-slug>/answers/r<N-1>.md` (if exists; absent for round 1) — prior round's snapshot.

## Process

### 1. Read state

Read all inputs above. Understand:
- What the prior cumulative answer claimed (if any).
- What the new layer added: which leaves are new, what they say, which are terminal (Established / Common knowledge / Contested / Hidden / Speculative / Under-investigated) vs Investigated.
- Which god nodes / communities / surprising connections the round's graph surfaced.

### 2. Write `answers/rN.md` (frozen snapshot)

```bash
mkdir -p {root}/docs/inv/<topic-slug>/answers
```

Write to `{root}/docs/inv/<topic-slug>/answers/rN.md` with this structure:

````markdown
# Round N answer: <topic>

**Date:** YYYY-MM-DD
**Thread researched this round:** <the thread that was drilled>
**Upstream research:** docs/inv/<topic-slug>/research/rN.md
**Upstream graph:** docs/inv/<topic-slug>/graphs/rN/GRAPH_REPORT.md

## What we know

<2-4 paragraphs of sourced narrative — the established and corroborated parts of the story so far. Cite sources inline (NYT 2014, FOIA-2020-XYZ, Smith podcast 2023). Distinguish primary-traced claims from reported-only ones explicitly.>

## Where it's contested

- <each side documented with primary sources; reader leaves understanding why people disagree, not who's right>

## Where it's hidden

- <claims with real referents but inaccessible content — note the boundary>

## Where it's speculative

- <rumor, fan theory, third-hand accounts — clearly tagged as such>

## Source spectrum at this round

- Mainstream / institutional: <count, key outlets>
- Independent / critical: <count, key outlets>
- Primary archives: <count, key archives>
- Community / believer / skeptic: <count, key forums/figures>
````

This file is **frozen**. Future rounds never edit it.

### 3. Rewrite `answer.md` (cumulative running answer)

The cumulative answer integrates this round with prior rounds. Round 1 = the snapshot (answer.md mirrors answers/r1.md). Rounds ≥ 2 = synthesize prior + new.

When integrating:
- Promote claims from "Where it's contested" or "Where it's speculative" (in the prior answer.md) to "What we know" if the round resolved them with new corroborated or primary-traced sources.
- Demote claims to "Where it's contested" if this round surfaced credible disagreement.
- Demote claims to "Where it's hidden" if this round established that the truth exists but is concealed.
- Preserve the original topic as the doc title.

Write to `{root}/docs/inv/<topic-slug>/answer.md` with the same structure as `answers/rN.md`, except:
- Header note: "Last updated: round N (YYYY-MM-DD)".
- Prose can reference the investigation log: "This investigation has reached depth N across the multi-axial log — see investigation-log.md".

### 4. Update `investigation-log.md` (terminal classifications)

`inv-research` already extended the tree with the round's new layer. Verify the leaves added this round have terminal classifications applied where appropriate (Established / Common knowledge / Contested / Hidden / Speculative / Under-investigated). If any leaves are still Investigated but the round hit the 3-layer cap, leave them Investigated — the user can opt to drill further next round.

### 5. Write `synthesis/rN.md` (round summary + ranked next-areas)

```bash
mkdir -p {root}/docs/inv/<topic-slug>/synthesis
```

Write to `{root}/docs/inv/<topic-slug>/synthesis/rN.md`:

````markdown
# Round N synthesis: <original question>

**Date:** YYYY-MM-DD
**Thread researched this round:** <thread>
**Layers added this round:** <count, ≤ 3>

## What changed this round

<1-2 paragraphs: what the new layer added to our understanding. Mention god nodes / surprising connections from the graph that mattered.>

## Proposed next areas (ranked)

1. **[<node-id> — <state>]** <one-line proposal>  *— <why this matters>*
2. ...
3. ...

## What's terminal on this thread

- [Established] <node>: <terminal justification>
- [Common knowledge] <node>: <one-line>
- [Contested] <node>: <pro-cites; con-cites>
- [Hidden] <node>: <boundary description>
- [Speculative] <node>: <one-line — what's only speculation>
- [Under-investigated] <node>: <strategies tried>
````

**Ranking heuristics for "Proposed next areas"** (priority order, top of list highest):

1. **Contested leaves on the active thread** — credible disagreement is high-leverage; the user should know what would resolve it.
2. **Unexplored siblings of deeply-investigated nodes** — the topic's other axes (origin / actor / document / timing / counter / adjacent) for the same subject.
3. **Adjacent threads suggested by the round's findings** — god nodes / surprising bridges from the graph that aren't yet on the investigation tree.
4. **Hidden leaves where new evidence might emerge** — e.g., FOIA pending, archive recently digitized.
5. **Under-investigated leaves** — lower priority because thorough search came up empty, but worth listing if the user has a different search angle.
6. **Never propose Established or Common knowledge leaves.** They are terminal by definition.
7. **Never propose Speculative leaves.** They are terminal because the verifiable record is exhausted.

Aim for 3-5 proposals. If fewer than 3 non-terminal candidates exist, say so explicitly: "All threads on the active subtree terminate. Pick a sibling thread or stop."

### 6. Print the gate prompt to chat

Print exactly:

```
Round N complete. Read the running answer at {root}/docs/inv/<topic-slug>/answer.md.

Where to next?
  • Dig deeper on one of: [1] [2] [3] ...   (numbers refer to docs/inv/<topic-slug>/synthesis/rN.md)
  • Propose a different area
  • Compile investigative report
  • Stop — answer is good enough
```

Then EXIT. Wait for the user's choice. Do not auto-advance.

## Hard Rules

- **Never compile the long-form investigative report.** That is `inv-report`. Synthesis describes what we know, what's contested, what's hidden, what's speculative — at the level of running notes, not polished prose.
- **Never auto-trigger another round.** The gate is mandatory.
- **Never edit `answers/rN.md` after writing it.** Snapshots are frozen.
- **Never propose Established, Common knowledge, or Speculative leaves as next areas.** They are terminal.
- **Cite sources inline in `answer.md` and `answers/rN.md`.** Claims without citations are flagged unverified.

## Anti-Patterns

### Report bleed
Slipping the polished report's framing into answer.md. Fix: answer.md is research notes — bulleted, sourced, structural. The narrative arc + named characters + scene-setting belongs in `inv-report`, opt-in.

### Advocacy bleed
Adopting one side's framing in answer.md. Fix: answer.md must distinguish "what we know" (corroborated) from "where it's contested" (sides documented separately). If your prose reads like one side wrote it, redistribute claims accordingly.

### Stale prior answer
Carrying forward claims from a prior round's answer.md without re-validating against the new round's research. Fix: every section of answer.md must be reconciled with this round's findings. Either it still holds (cite the round it was first established), or this round modified it (note the change), or this round contradicts it (move to "Where it's contested").

### Vague next-area proposals
Proposals like "look more into the gut-brain axis" are unusable. Fix: every proposal references a specific investigation-log node ID or a specific concept from the graph, plus a one-line "why this matters".

### Ranking by novelty over leverage
Promoting an exotic-sounding proposal to #1 because it sounds interesting. Fix: rank by the heuristic order above. Unknown leaves on the active thread beat shiny new threads.

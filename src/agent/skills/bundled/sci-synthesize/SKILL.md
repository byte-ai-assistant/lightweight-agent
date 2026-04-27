---
name: sci-synthesize
description: Use after sci-research and sci-graphify complete a round — synthesizes the round's findings into (1) a cumulative answer.md that integrates the new layer, (2) a frozen answers/rN.md snapshot, (3) a synthesis/rN.md round summary with 3-5 ranked next-area proposals for the user gate. Updates depth-log.md leaf states. Never generates hypotheses.
---

# Sci Synthesize

## Working directory

The agent's pinned working directory is `{root}`. Synthesis artifacts live under `{root}/docs/sci/<topic-slug>/`. Do not write outside this tree.

## The Rule

```
INTEGRATE THE NEW LAYER. RANK NEXT AREAS. PRESENT THE GATE. NEVER HYPOTHESIZE.
```

This phase reads the round's research doc + graph reading + depth-log, and produces three artifacts:

1. **`answers/rN.md`** — frozen per-round snapshot. What we know after this round, written as if this round were the last. Never edited later.
2. **`answer.md`** — the running cumulative answer, rewritten this round to integrate the new layer with the prior layers.
3. **`synthesis/rN.md`** — the round summary + 3-5 ranked next-area proposals presented at the user gate.

Synthesis does **not** generate hypotheses. If the user wants a hypothesis, the dispatcher routes them to `sci-hypothesize`.

## Inputs

- Round number `N` (integer ≥ 1) — passed in by `sci-research-cycle`.
- Topic slug — the project directory under `{root}/docs/sci/`.
- The thread that was researched this round (the original question for round 1; user-picked area for rounds ≥ 2).
- `{root}/docs/sci/<topic-slug>/research/rN.md` — this round's literature survey.
- `{root}/docs/sci/<topic-slug>/graphs/rN/` — this round's graph artifacts (graph.json, GRAPH_REPORT.md).
- `{root}/docs/sci/<topic-slug>/depth-log.md` — the why-tree, already updated by `sci-research` with the new layer's leaves.
- `{root}/docs/sci/<topic-slug>/answer.md` (if exists; absent for round 1) — prior cumulative answer.
- `{root}/docs/sci/<topic-slug>/answers/r<N-1>.md` (if exists; absent for round 1) — prior round's snapshot.

## Process

### 1. Read state

Read all inputs above. Understand:
- What the prior cumulative answer claimed (if any).
- What the new layer added: which leaves are new, what they say, which are terminal (Fundamental / Obvious / Unknown / Under-researched) vs Answered.
- Which god nodes / communities / surprising connections the round's graph surfaced.

### 2. Write `answers/rN.md` (frozen snapshot)

```bash
mkdir -p {root}/docs/sci/<topic-slug>/answers
```

Write to `{root}/docs/sci/<topic-slug>/answers/rN.md` with this structure:

````markdown
# Round N answer: <original question>

**Date:** YYYY-MM-DD
**Thread researched this round:** <the thread that was drilled>
**Upstream research:** docs/sci/<topic-slug>/research/rN.md
**Upstream graph:** docs/sci/<topic-slug>/graphs/rN/GRAPH_REPORT.md

## What we know after round N

<2-4 paragraphs of prose. The actual answer at the current depth of understanding. Cite sources inline (Smith 2022, Jones 2023). Distinguish causal claims from correlational ones explicitly.>

## Why this answer holds

- <bullet linking each supporting mechanism to its depth-log node — e.g. "Q2.1.1 [Fundamental]: SCFAs cross BBB via MCT1">
- ...

## Where this answer is uncertain

- <Unknown leaves on the active thread, with the literature's own admission cited>
- <Under-researched leaves, noting search strategies tried>

## Where it bottoms out

- <Fundamental leaves on active threads — bullet each with its terminal justification>
- <Obvious leaves — bullet each>
````

This file is **frozen**. Future rounds never edit it.

### 3. Rewrite `answer.md` (cumulative running answer)

The cumulative answer integrates this round with prior rounds. Round 1 = the snapshot (answer.md mirrors answers/r1.md). Rounds ≥ 2 = synthesize prior + new.

When integrating:
- Promote new mechanisms from "Where this answer is uncertain" (in the prior answer.md) to "Why this answer holds" if the round resolved them with sourced findings.
- Demote claims to "Where this answer is uncertain" if the round surfaced contested literature.
- Preserve the original question as the doc title.

Write to `{root}/docs/sci/<topic-slug>/answer.md` with the same structure as `answers/rN.md`, except:
- Header note: "Last updated: round N (YYYY-MM-DD)".
- Prose can reference the depth log: "This answer chases the why-chain to depth N — see depth-log.md".

### 4. Update `depth-log.md` (terminal classifications)

`sci-research` already extended the tree with the round's new layer. Verify the leaves added this round have terminal classifications applied where appropriate (Fundamental / Obvious / Unknown / Under-researched). If any leaves are still Answered but the round hit the 3-layer cap, leave them Answered — the user can opt to drill further next round.

### 5. Write `synthesis/rN.md` (round summary + ranked next-areas)

```bash
mkdir -p {root}/docs/sci/<topic-slug>/synthesis
```

Write to `{root}/docs/sci/<topic-slug>/synthesis/rN.md`:

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

- [Fundamental] <node>: <terminal justification>
- [Obvious] <node>: <one-line>
- [Unknown] <node>: <citation>
- [Under-researched] <node>: <strategies tried>
````

**Ranking heuristics for "Proposed next areas"** (priority order, top of list highest):

1. **Unknown leaves on the active thread** — these are active scientific frontiers. Highest leverage.
2. **Unexplored siblings of deeply-explored nodes** — e.g. "we drilled why X causes Y; what if causation runs Y → X?"
3. **Adjacent threads suggested by the round's findings** — concepts that surfaced as god nodes or surprising connections in the graph but aren't yet on the depth tree.
4. **Under-researched leaves** — lower priority because search may have missed something but yield is unlikely.
5. **Never propose Fundamental or Obvious leaves.** They are terminal by definition.

Aim for 3-5 proposals. If fewer than 3 non-terminal candidates exist, say so explicitly: "All threads on the active subtree terminate. Pick a sibling thread or stop."

### 6. Print the gate prompt to chat

Print exactly:

```
Round N complete. Read the enriched answer at {root}/docs/sci/<topic-slug>/answer.md.

Where to next?
  • Dig deeper on one of: [1] [2] [3] ...   (numbers refer to docs/sci/<topic-slug>/synthesis/rN.md)
  • Propose a different area
  • Hypothesize against the current answer
  • Stop — answer is good enough
```

Then EXIT. Wait for the user's choice. Do not auto-advance.

## Hard Rules

- **Never generate a hypothesis.** That is `sci-hypothesize`. Synthesis describes what we know and ranks what to look at next.
- **Never auto-trigger another round.** The gate is mandatory.
- **Never edit `answers/rN.md` after writing it.** Snapshots are frozen.
- **Never propose Fundamental or Obvious leaves as next areas.** They are terminal.
- **Cite sources inline in `answer.md` and `answers/rN.md`.** Claims without citations are flagged unverified.

## Anti-Patterns

### Hypothesis bleed
Slipping a hypothesis into answer.md. Fix: if you find yourself writing "this suggests we should test...", stop. That belongs in `sci-hypothesize`. Synthesis answers; it does not predict.

### Stale prior answer
Carrying forward claims from a prior round's answer.md without re-validating against the new round's research. Fix: every section of answer.md must be reconciled with this round's findings. Either it still holds (cite the round it was first established), or this round modified it (note the change), or this round contradicts it (move to "Where this answer is uncertain").

### Vague next-area proposals
Proposals like "look more into the gut-brain axis" are unusable. Fix: every proposal references a specific depth-log node ID or a specific concept from the graph, plus a one-line "why this matters".

### Ranking by novelty over leverage
Promoting an exotic-sounding proposal to #1 because it sounds interesting. Fix: rank by the heuristic order above. Unknown leaves on the active thread beat shiny new threads.

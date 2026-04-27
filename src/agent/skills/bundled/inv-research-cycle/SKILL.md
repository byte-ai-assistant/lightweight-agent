---
name: inv-research-cycle
description: Use to run one round of iterative investigative research on a thread. Orchestrates inv-research → inv-graphify → inv-synthesize, then stops at a user gate. Compiling the long-form report is NOT part of this cycle — it is opt-in via inv-report. Each round drills up to 3 layers of investigation on the chosen thread; the user decides between rounds whether to dig deeper, switch threads, compile the report, or stop.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Inv Research Cycle — Iterative Orchestrator

## Working directory

The agent's pinned working directory is `{root}`. All paths below that begin with `docs/` are relative to that root. Do not write investigative artifacts outside `{root}/docs/inv/`.

## Overview

One round of the iterative investigation loop. Each round drills one thread up to 3 layers, then stops at a user gate.

```
this round's thread (round N):
   → [inv-research]    drills up to 3 layers; classifies leaves;
                       writes research/rN.md + raw/ files +
                       extends investigation-log.md
   → [inv-graphify]    rebuilds graph from full accumulated raw/ corpus;
                       writes graphs/rN/ artifacts + graphs/rN.md reading
   → [inv-synthesize]  rewrites answer.md (cumulative); writes
                       answers/rN.md (frozen snapshot) + synthesis/rN.md
                       (round summary + ranked next-areas)
   → user gate: dig deeper / propose other area / compile report / stop
```

The cycle terminates after one round. To run another round, the user must explicitly choose "dig deeper on [n]" or propose another area, which re-invokes this cycle with `round=N+1` and the new thread.

## Inputs

- **Thread (required):** the question this round drills.
  - Round 1: the user's original research question.
  - Round ≥ 2: the user-picked thread from the prior round's `synthesis/r<N-1>.md` ranked proposals.
- **Round number `N` (required):** integer ≥ 1.
- **Topic slug:** the project directory under `{root}/docs/inv/<topic-slug>/`. For round 1, derive it from the question (lowercase-kebab-case). For rounds ≥ 2, the dispatcher passes the existing slug.

## Preconditions

- `EXA_API_KEY` is set (research phase requires it).
- `python3 -c "import graphify"` succeeds. If not, print the install command from `inv-graphify` and stop.
- `{root}/docs/inv/<topic-slug>/` directory tree exists (create on round 1):
  ```bash
  mkdir -p {root}/docs/inv/<topic-slug>/{raw,research,graphs,answers,synthesis,reports}
  ```
- For rounds ≥ 2: `investigation-log.md`, `answer.md`, and at least one prior `answers/r<M>.md` exist. If not, the dispatcher made a routing error — stop and ask the user to clarify.

## Phase 1 — Research

Load skill: `inv-research`

- Inputs: thread, round number N, topic slug.
- Drills up to 3 layers on the thread; classifies leaves (Investigated / Established / Common knowledge / Contested / Hidden / Speculative / Under-investigated).
- Outputs:
  - `{root}/docs/inv/<topic-slug>/research/rN.md`
  - New entries in `{root}/docs/inv/<topic-slug>/raw/` (cumulative — does not delete prior rounds' files)
  - Extended `{root}/docs/inv/<topic-slug>/investigation-log.md`
- **Internal gate (orchestrator-checked, no user interaction):** verify research/rN.md exists, raw/ has ≥ 5 cumulative files, investigation-log.md was updated. If any check fails, stop and surface the error to the user.

## Phase 2 — Graphify

Load skill: `inv-graphify`

- Inputs: round number N, full accumulated `raw/` corpus, current research/rN.md, topic slug.
- Rebuilds graph from full corpus.
- Outputs:
  - `{root}/docs/inv/<topic-slug>/graphs/rN/` (graph.json, GRAPH_REPORT.md, graph.html)
  - `{root}/docs/inv/<topic-slug>/graphs/rN.md` (annotated reading)
- **Internal gate:** verify both artifacts exist. If graph has < 15 nodes or < 3 communities, surface the corpus-too-thin warning to the user and ask whether to add sources or proceed with the thin graph.

## Phase 3 — Synthesize

Load skill: `inv-synthesize`

- Inputs: round number N, thread, topic slug. Reads research/rN.md, graphs/rN/, investigation-log.md, prior answer.md (if exists).
- Outputs:
  - `{root}/docs/inv/<topic-slug>/answers/rN.md` (frozen snapshot)
  - `{root}/docs/inv/<topic-slug>/answer.md` (rewritten cumulative)
  - `{root}/docs/inv/<topic-slug>/synthesis/rN.md` (round summary + ranked next-areas)
- **User gate:** synthesize itself prints the gate prompt. The orchestrator does not advance — it exits after synthesize completes.

## Termination

This skill exits after Phase 3. The user's choice at the gate is handled by `inv-agent`:

- "Dig deeper on [n]" → dispatcher re-invokes this cycle with `round=N+1` and the picked thread.
- "Propose a different area: <text>" → dispatcher re-invokes this cycle with `round=N+1` and the user's text as the thread.
- "Compile investigative report" → dispatcher routes to `inv-report` (does NOT re-invoke this cycle).
- "Stop" → dispatcher acknowledges and exits.

This cycle never auto-loops. The orchestrator does not know whether the next user message will be a continuation or something else.

## Hard Rules

- **Do not skip phases.** Every round runs research → graphify → synthesize in order.
- **Do not auto-invoke `inv-report` from this cycle.** Compiling the long-form report is opt-in only and is dispatched by `inv-agent`.
- **Do not auto-loop into round N+1.** The user gate at the end of Phase 3 is mandatory.
- **Do not advocate.** Document what's established, contested, hidden, speculative.
- **Every internal gate failure surfaces to the user.** Do not silently retry or paper over missing artifacts.

## Error Recovery

If this session crashes mid-round:
- Phase 1 incomplete (no research/rN.md): re-run the cycle with the same thread and round; this is idempotent (overwrites research/rN.md with confirmation).
- Phase 1 complete but Phase 2 incomplete: re-run with same args; inv-graphify rebuilds the round's graph dir from the existing corpus.
- Phase 2 complete but Phase 3 incomplete: re-run; inv-synthesize uses the existing rN artifacts.
- investigation-log.md corruption: prefer manual repair over automatic regeneration. The investigation log is the source of truth for the multi-axial leaf tree.

A re-run of any phase overwrites its current-round output (with a confirmation prompt) but leaves prior rounds untouched. `answer.md` is the only file that aggregates across rounds — synthesize is responsible for not double-counting if a round is re-run.

## What this cycle is NOT

- Not a report compiler. That is `inv-report`, opt-in only.
- Not a multi-round runner. One round per invocation.
- Not a topic creator. Round 1 of a fresh topic still expects the dispatcher to have picked the slug; this cycle creates the directory tree if missing but does not derive a slug from a freeform question — the dispatcher does that.

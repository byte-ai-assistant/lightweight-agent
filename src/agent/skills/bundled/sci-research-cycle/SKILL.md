---
name: sci-research-cycle
description: Use when running a full scientific research cycle from a fresh question to a falsifiable hypothesis — orchestrates literature survey → knowledge-graph synthesis → hypothesis generation, with mandatory user gates between phases. Terminal artifact is a hypothesis doc with predicted effect size, kill criteria, and ruled-out alternatives.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Sci Research Cycle — Orchestrator

## Overview

This skill chains the three scientific phases in order. Each phase produces a markdown artifact that the next phase consumes. The terminal output is a falsifiable hypothesis doc.

```
research question
   → [sci-research]    → docs/sci/research/<date>-<topic>.md
                       + docs/sci/raw/<topic>/  (raw materials for the graph)
   → [sci-graphify]    → docs/sci/graphs/<date>-<topic>.md
                       + docs/sci/graphs/<topic>/graphify-out/  (graph.json, GRAPH_REPORT.md, graph.html)
   → [sci-hypothesize] → docs/sci/hypotheses/<date>-<name>.md  ← terminal doc
   → "Hand off to experimental design or a human."
```

## Why a graph phase

In quant work, the gap section of a research doc is enough to seed hypotheses. In science, the gap section by itself is too narrow — it lists what the literature hasn't yet asked, but it doesn't surface *which existing concepts unexpectedly link across subfields*. The most generative scientific hypotheses come from cross-community bridges (a method from one field applied to a problem in another, a mechanism observed in one organism replicated in a related one). The graph phase makes those bridges visible. Without it, hypotheses tend to restate what was already in the abstracts.

## Preconditions

- User has supplied a research question or topic (or you are resuming an in-flight chain).
- `EXA_API_KEY` is set (research phase depends on it).
- `python3 -c "import graphify"` succeeds (graphify phase depends on it). If not, print:
  ```
  python3 -m pip install graphifyy -q
  ```
  Wait for the user to install before continuing.
- `docs/sci/{research,raw,graphs,hypotheses}/` exist (create if not).

## Resume Logic

Before starting Phase 1, detect the highest-complete artifact for this topic. Ask the user whether to resume or start fresh.

```bash
ls -t docs/sci/hypotheses/ 2>/dev/null | head -5
ls -t docs/sci/graphs/     2>/dev/null | head -5
ls -t docs/sci/research/   2>/dev/null | head -5
```

If the user confirms resume, jump to the next incomplete phase. Do not re-run completed phases without explicit confirmation — overwriting a research doc loses the gap list that fed the graph and the hypotheses.

---

## Phase 1 — Research

Load skill: `sci-research`

- Input: the user's research question.
- Run the structured literature + dataset + replication survey.
- Save raw materials (abstracts, key passages, dataset cards, methodology notes) to `docs/sci/raw/<topic-slug>/` — these are the corpus the next phase will graph.
- Output: `docs/sci/research/YYYY-MM-DD-<topic>.md`.
- **Gate:** research doc written on disk with at least one *Gaps* entry AND `docs/sci/raw/<topic-slug>/` populated with at least 5 source files. Show the user the findings and ask: *"Shall we proceed to graph synthesis, or do you want me to dig deeper on any subdomain first?"* Wait for explicit go-ahead.

## Phase 2 — Graphify

Load skill: `sci-graphify`

- Input: the raw materials in `docs/sci/raw/<topic-slug>/`.
- Build the knowledge graph using graphify, label communities, identify god nodes, enumerate surprising cross-community connections.
- Output: `docs/sci/graphs/YYYY-MM-DD-<topic>.md` (annotated reading) + `docs/sci/graphs/<topic>/graphify-out/` (graphify artifacts).
- **Gate:** graph reading doc written with at least 3 *interesting connections* explicitly enumerated. Show the user the god nodes, communities, and surprising connections. Ask: *"Which connection (or god node) should I aim a hypothesis at?"* Wait for an explicit selection.

## Phase 3 — Hypothesize

Load skill: `sci-hypothesize`

- Input: the research doc, the graph reading doc, and the user-selected target (god node or surprising connection).
- Construct one or more falsifiable hypotheses; run the anti-pattern checklist; pre-specify the kill criteria.
- Output: `docs/sci/hypotheses/YYYY-MM-DD-<name>.md`.
- **Gate:** hypothesis doc written, anti-pattern checklist passed (no unfalsifiable claims, no pattern-without-mechanism, no missing kill criteria). Print the terminal message and stop.

## Terminal State

After Phase 3, print exactly:

```
HYPOTHESIS COMPLETE. docs/sci/hypotheses/<file>.md is ready.

The hypothesis spec includes:
 - Falsifiable claim (signal, prediction, sign, effect size, universe, horizon)
 - Mechanism (causal pathway with named entities from the graph)
 - Predicted effect size with confidence interval — set BEFORE outcome data is touched
 - Pre-specified kill criteria (numeric)
 - Alternative explanations to rule out (and how the experiment must be designed to rule them out)
 - Statistical considerations (sample size, multiple-comparison correction, power)
 - Connection to the knowledge graph (which god node or surprising connection it targets)

Next step: hand to experimental design (or a human protocol writer). The experiment must
be pre-registered against this doc. Any deviation from the kill criteria below means the
hypothesis is dead — do not rescue it with parameter tweaks.
```

Then EXIT. Do not invoke any experimental-design or implementation skill from this orchestrator.

## Hard Gates

- **Do NOT skip Phase 1.** Even if the user believes they already know the field, run the research phase. Confirmation bias and recency bias are at their worst when you trust your own summary of literature.
- **Do NOT skip Phase 2.** Hypothesizing without first looking at the graph is how you end up restating known findings. The graph is what surfaces the non-obvious bridge between subdomains.
- **Do NOT run experiments.** Not in any phase. The terminal output is markdown.
- **Do NOT auto-invoke any downstream skill.** The hand-off is a human decision. Print the instruction and stop.
- **Every gate requires user approval in chat.** You do not self-advance through phases.
- **Every artifact must cite its sources.** A claim without a citation is flagged *unverified* and excluded from the next phase's input.

## Error Recovery

If this session crashes mid-cycle, the next invocation of `sci-agent` will detect the highest-complete artifact and ask whether to resume. Artifacts are idempotent — a re-run of a phase overwrites its output file (with a confirmation prompt) but leaves prior phases untouched.

If `sci-graphify` fails because graphify can't process the corpus (e.g. only PDFs and no text extracted), drop back to Phase 1 and ask the user whether to add more text-format sources or to skip the graph phase. Skipping the graph phase is allowed only with explicit user confirmation, and the resulting hypothesis doc must be flagged `**Graph phase: skipped**` so the experimenter knows the bridge analysis was not done.

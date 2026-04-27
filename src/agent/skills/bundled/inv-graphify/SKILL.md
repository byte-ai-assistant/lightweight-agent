---
name: inv-graphify
description: Use after inv-research completes a round and before inv-synthesize — builds a knowledge graph from the round's accumulated raw materials, identifies god nodes, communities, and cross-community bridges (corroborations, contradictions, derivations) that inform the round's analytical answer. Per-round output to graphs/rN/ rebuilt from the full accumulated corpus.
---

# Inv Graphify

## Working directory

The agent's pinned working directory is `{root}`. Investigative artifacts live under `{root}/docs/inv/<topic-slug>/`. **Per-round graphify output for this project lives at `{root}/docs/inv/<topic-slug>/graphs/rN/`** (where N is the round number). Bash commands in this skill assume the agent is operating from `{root}` unless `cd`'d explicitly.

Each round rebuilds the graph from the **full accumulated `raw/` corpus** — there is no incremental merge across rounds.

## The Rule

```
GRAPH THE CORPUS. NAME THE BRIDGES. SURFACE CORROBORATIONS AND CONTRADICTIONS. THEN SYNTHESIZE.
```

In investigative work, the most generative insights come from cross-source bridges — two independent sources that converge on the same claim (corroboration), or two that disagree (the genuinely contested space). The graph makes both visible. Without it, the round's answer is a list of citations rather than a structured map of where the field agrees and disagrees.

This phase does three things:
1. Turns the raw-materials folder (`{root}/docs/inv/<topic-slug>/raw/`) into a knowledge graph using `graphify`.
2. Reads `GRAPH_REPORT.md` and annotates it: god nodes (most-cited entities/people/events), communities (clusters of related sources), corroborations (independent sources converging), contradictions (sources disagreeing).
3. Writes the annotated reading to `{root}/docs/inv/<topic-slug>/graphs/rN.md` — input the synthesize phase consumes.

## Prerequisites

Before first use, check that `graphify` and `networkx` are installed:

```bash
python3 -c "import graphify" 2>/dev/null || python3 -m pip install graphifyy -q
python3 -c "import networkx" 2>/dev/null || python3 -m pip install networkx -q
```

If the install fails, stop and ask the user to install graphify themselves. Do not proceed with a graph phase you cannot actually run.

## Inputs

- **Round number `N` (required):** passed in by `inv-research-cycle`. Determines output dir.
- The full accumulated raw-materials folder: `{root}/docs/inv/<topic-slug>/raw/` (must contain ≥ 5 markdown files; cumulatively across all prior rounds).
- The current round's research doc: `{root}/docs/inv/<topic-slug>/research/rN.md`.
- The topic slug (the project directory name under `{root}/docs/inv/`).

If the raw-materials folder has fewer than 5 files, STOP. Drop back to `inv-research`. A sparse corpus produces a sparse graph, which produces no usable communities.

## Inventory the Corpus

Before graphing, quickly read the raw-materials folder to make sure it looks right:

```bash
ls -la {root}/docs/inv/<topic-slug>/raw/
```

Confirm:
- Mostly markdown files with frontmatter (these graph best).
- A mix of papers, methodology notes, and dataset cards (a corpus of only-papers produces a graph dominated by citation edges and misses the method/dataset bridges).
- No placeholder files (e.g. empty `.md` stubs).

If the mix is wrong, return to `inv-research`. Do not patch the gaps silently — the experimenter needs to see that the graph phase was input-limited.

## Build the Graph

The graphify artifacts go inside the project's `graphs/` folder, alongside the annotated reading doc in `graphs/`.

```bash
mkdir -p {root}/docs/inv/<topic-slug>/graphs/rN
cd {root}/docs/inv/<topic-slug>/graphs/rN
```

All subsequent commands assume `cwd = {root}/docs/inv/<topic-slug>/graphs/rN/`. Raw materials for this project are at `../../raw/` (two levels up from this round's graphs folder).

Write the Python interpreter path once, then reuse it:

```bash
python3 -c "import sys; open('.graphify_python', 'w').write(sys.executable)"
```

### Step 1 — Detect files

```bash
$(cat .graphify_python) -c "
import json
from graphify.detect import detect
from pathlib import Path
result = detect(Path('../../raw'))
Path('.graphify_detect.json').write_text(json.dumps(result))
print(f'Corpus: {result.get(\"total_files\",0)} files, ~{result.get(\"total_words\",0):,} words')
for ftype in ['code','document','paper','image','video']:
    files = result.get('files',{}).get(ftype, [])
    if files:
        print(f'  {ftype}: {len(files)} files')
"
```

The relative path `../../raw` resolves to `{root}/docs/inv/<topic-slug>/raw/` given the `cd` above (cwd is `graphs/rN/`).

If `total_files == 0` or `total_words < 1000`, stop. The graph will not produce meaningful communities. Return to `inv-research`.

### Step 2 — AST extraction (no-op, usually)

Investigative corpora are almost entirely markdown (transcript captures, archive notes, article excerpts), so AST extraction returns nothing useful. Run the stub anyway so downstream steps don't break:

```bash
$(cat .graphify_python) -c "
import json
from pathlib import Path
Path('.graphify_ast.json').write_text(json.dumps({
    'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0
}))
print('AST: 0 nodes (investigative corpus, no code)')
"
```

### Step 3 — Semantic extraction (inline)

You are the language model doing semantic extraction. For each file in the raw-materials folder, read it and extract:

- **Nodes** — named concepts, mechanisms, organisms, methods, datasets, effect sizes, diseases, variables, instruments. One node per distinct entity. The node `label` is the human-readable name; the `id` is `<filestem>_<snake_case_entity>`.
- **Edges** — relationships between nodes. Use `relation` values from this set:
  - `corroborates` — two independent sources support the same claim
  - `contradicts` — two sources disagree on the same claim
  - `predates` — source A historically precedes source B (and may be the origin of B's claim)
  - `derived_from` — B reports on / cites A (use this when source B is downstream of source A's reporting)
  - `same_actor` — two sources reference the same person or organization
  - `mentions` — generic context link
  - `conceptually_related_to` — shared concept without structural link
- **Confidence** — `EXTRACTED` (stated in text) or `INFERRED` (you inferred the link) or `AMBIGUOUS` (uncertain).

Write the combined result to `.graphify_semantic.json`:

```json
{
  "nodes": [
    {"id":"smith2022_microbiome_alpha_diversity","label":"Microbiome alpha-diversity","file_type":"document","source_file":"../raw/smith-2022.md"},
    {"id":"smith2022_phq9","label":"PHQ-9","file_type":"document","source_file":"../raw/smith-2022.md"}
  ],
  "edges": [
    {"source":"smith2022_microbiome_alpha_diversity","target":"smith2022_phq9","relation":"conceptually_related_to","confidence":"EXTRACTED","confidence_score":1.0,"source_file":"../raw/smith-2022.md","weight":1.0}
  ],
  "hyperedges": [],
  "input_tokens": 0,
  "output_tokens": 0
}
```

Rules:
- Use the source's short id (author-year-outlet for journalism; archive-id for primary docs; show-guest-year for podcasts) as the prefix for all its entities so they stay grouped.
- When two sources reference the same concept, still emit two nodes with different ids — preserves provenance. The graph's `semantically_similar_to` inference will surface the link.
- For each cross-reference explicitly noted ("the NYT article cited the Reuters report"), emit a `derived_from` edge from the citing source to the cited source.
- For each independent corroboration (two sources making the same factual claim, neither citing the other), emit a `corroborates` edge between the two findings.
- For each contradicted claim (Source A says X, Source B says ¬X), emit an explicit `contradicts` edge.
- For each shared person/organization across sources, emit a `same_actor` edge between the two source-scoped entity nodes.
- Do not invent connections that aren't in the text. If you're unsure, mark `AMBIGUOUS` with `confidence_score: 0.2`.

### Step 4 — Merge AST (empty) + semantic

```bash
$(cat .graphify_python) -c "
import json
from pathlib import Path
ast = json.loads(Path('.graphify_ast.json').read_text())
sem = json.loads(Path('.graphify_semantic.json').read_text())
seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n); seen.add(n['id'])
merged = {
    'nodes': merged_nodes,
    'edges': ast['edges'] + sem['edges'],
    'hyperedges': sem.get('hyperedges', []),
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('.graphify_extract.json').write_text(json.dumps(merged, indent=2))
print(f'Merged: {len(merged_nodes)} nodes, {len(merged[\"edges\"])} edges')
"
```

### Step 5 — Build graph, cluster, analyze

```bash
$(cat .graphify_python) -c "
import json
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from pathlib import Path

extraction = json.loads(Path('.graphify_extract.json').read_text())
detection  = json.loads(Path('.graphify_detect.json').read_text())

G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': extraction.get('input_tokens',0), 'output': extraction.get('output_tokens',0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: 'Community ' + str(cid) for cid in communities}
questions = suggest_questions(G, communities, labels)

report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '../../raw', suggested_questions=questions)
Path('GRAPH_REPORT.md').write_text(report)
to_json(G, communities, 'graph.json')
analysis = {
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods,
    'surprises': surprises,
    'questions': questions,
}
Path('.graphify_analysis.json').write_text(json.dumps(analysis, indent=2))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
"
```

If the graph has fewer than 15 nodes or fewer than 3 communities, the corpus is too thin. Stop and return to `inv-research` to add more raw materials.

### Step 6 — Label communities

Read `.graphify_analysis.json`. For each community, look at its top-degree node labels and assign a 2–5 word plain-language name that reflects the scientific subdomain (e.g. *"Microbiome measurement methods"*, *"Depression diagnostic instruments"*, *"Gut-brain vagal signalling"*, *"UK Biobank cohort analyses"*).

Then regenerate the report:

```bash
$(cat .graphify_python) -c "
import json
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from pathlib import Path

extraction = json.loads(Path('.graphify_extract.json').read_text())
detection  = json.loads(Path('.graphify_detect.json').read_text())
analysis   = json.loads(Path('.graphify_analysis.json').read_text())

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens',0), 'output': extraction.get('output_tokens',0)}

labels = LABELS_DICT  # replace with the dict you built

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, analysis['gods'], analysis['surprises'], detection, tokens, '../../raw', suggested_questions=questions)
Path('GRAPH_REPORT.md').write_text(report)
Path('.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}))
print('Report updated with community labels')
"
```

### Step 7 — HTML visualisation (optional but default)

```bash
$(cat .graphify_python) -c "
import json
from graphify.build import build_from_json
from graphify.export import to_html
from pathlib import Path

extraction = json.loads(Path('.graphify_extract.json').read_text())
analysis   = json.loads(Path('.graphify_analysis.json').read_text())
labels_raw = json.loads(Path('.graphify_labels.json').read_text()) if Path('.graphify_labels.json').exists() else {}
G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
labels = {int(k): v for k, v in labels_raw.items()}
if G.number_of_nodes() > 5000:
    print(f'Graph has {G.number_of_nodes()} nodes — too large for HTML viz')
else:
    to_html(G, communities, 'graph.html', community_labels=labels or None)
    print('graph.html written')
"
```

### Step 8 — Clean up intermediate files

```bash
rm -f .graphify_detect.json .graphify_extract.json .graphify_ast.json .graphify_semantic.json .graphify_analysis.json .graphify_labels.json
```

Keep `graph.json`, `GRAPH_REPORT.md`, and `graph.html` — these are the artefacts. Return to the repo root (`cd {root}`).

## Read the Report — the Real Work

Reading `GRAPH_REPORT.md` is the cognitive task of this phase. The three sections that matter most:

### 1. God Nodes — load-bearing concepts

God nodes are the most-connected entities in the graph. In an investigative corpus they are usually:
- **Named persons** that many sources reference (e.g., *John Pemberton*, *Sergey Brin*).
- **Named organizations** (e.g., *Coca-Cola Company*, *NSA*, *Vatican*).
- **Documents** that multiple sources cite (e.g., *Watergate tapes*, *Pentagon Papers*, *Dead Sea Scrolls*).
- **Events** that anchor the topic (e.g., *Roswell incident*, *Snowden disclosures*).
- **Locations** that multiple narratives revisit (e.g., *Area 51*, *Qumran caves*).

A finding that targets a god node has high explanatory leverage — what it asserts about the node ripples through the rest of the corpus. A finding that targets a node of degree 2 or 3 may still matter (genuinely novel cross-community bridge), but god nodes are the load-bearing pieces of the topic.

### 2. Communities — subdomains

Each community is a cluster of nodes the detection algorithm groups together. In an investigative corpus, communities usually correspond to:
- Source perspectives (mainstream press / believer community / skeptic community / primary archive).
- Time periods (early reporting vs. retrospective accounts vs. modern revisits).
- Actors and their networks (Person X's circle vs. Person Y's circle).
- Document genres (court records / FOIA releases / podcast transcripts / blog posts).

Label each community with a domain-accurate 2–5 word name. Vague names (*"Community 1"*, *"Sources"*) kill the utility of the graph for synthesize.

### 3. Surprising Connections — the interesting bits

These are the bridges. In investigative work, the most useful are:
- **Independent corroborations across communities** — mainstream press + primary archive + believer-community source all converging on the same claim is high-confidence.
- **Cross-community contradictions** — a claim that's load-bearing in one community but contradicted in another community.
- **Same actor across communities** — when a named person appears in two otherwise-disconnected source clusters, that person is often the missing link in the topic's narrative.
- **A derived-from chain that bottoms out at a single primary source** — every secondary source on the topic chains back to one report, raising the importance of validating that primary.

Enumerate the 3–5 most informative bridges explicitly. For each, write one line on **why it's interesting** — what question it suggests about the underlying topic.

## Output

Write `{root}/docs/inv/<topic-slug>/graphs/rN.md` (this is the per-round annotated reading, sibling to the round's `rN/` artifact dir):

```markdown
# Graph reading round N: <thread>

**Date:** YYYY-MM-DD
**Upstream research:** docs/inv/<topic-slug>/research/rN.md
**Corpus:** docs/inv/<topic-slug>/raw/ (<N> files, ~<W> words)
**Graph artifacts:** docs/inv/<topic-slug>/graphs/rN/
## Graph shape

- Nodes: <N>
- Edges: <N>
- Communities: <N>
- Density: <low | medium | high — inspect GRAPH_REPORT.md>

## Communities (labelled)

| ID | Label | Size | Cohesion | Representative nodes |
|----|-------|------|----------|----------------------|
| 0  | Mainstream press 2010s | 14 | 0.71 | NYT 2014, Guardian 2015, BBC 2016, Reuters 2017 |
| 1  | Disclosure-community sources | 11 | 0.66 | The Black Vault, Coalition for Freedom of Information |
| 2  | Primary archive — government | 9  | 0.58 | FOIA release 2020, Senate hearing 1987, FCC filing |
| ... | ... | ... | ... | ... |

## God nodes (high-degree)

1. **<Named person / org / event / document>** (degree N) — <role in the topic; why this is load-bearing>
2. ...

## Bridges — high-leverage cross-source connections

Each line names a cross-community bridge and the *open question* it suggests.

1. **Independent corroboration:** <Node A, community X> ↔ <Node B, community Y> — relation: `corroborates` — why interesting: <one line>
2. **Cross-community contradiction:** <Node A, community X> ↔ <Node B, community Y> — relation: `contradicts` — why interesting: <one line>
3. **Same actor across silos:** <Named person> appears in communities <X> and <Y> — what bridge they form
4. ...

## Open disputes visible in the graph

Pairs of nodes connected by `contradicts`, or pairs of communities that have both pro- and anti- edges on the same claim. List them — these become `Contested` leaf candidates in the investigation log.

## What the graph cannot tell you

- <e.g. "the corpus excludes paywalled academic books on this topic; the historical-scholarship community is under-represented in the graph">
- <e.g. "podcast episodes are represented by transcript excerpts only — tone and emphasis are missing">

## Handoff to inv-synthesize

Key signals for the synthesize phase to integrate into this round's answer and ranked next-area proposals:
- God node 1 — <name, why it matters>
- Independent corroboration — <pair, why high-confidence>
- Cross-community contradiction — <pair, what's contested>
- Same-actor bridge — <person, what they connect>

Synthesize will combine these with the investigation-log to produce the round's `answers/rN.md` snapshot, the rewritten cumulative `answer.md`, and the ranked next-area proposals at the user gate.
```

## Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "The graph phase is overhead, I already see the hypothesis" | You see the hypothesis the literature already offered you. The graph surfaces the hypothesis *nobody has tested yet*. That's the whole point of this phase. |
| "The corpus is small, the graph will be trivial" | Small graphs still surface the cross-community bridges. If the graph has no bridges, that's itself a finding: the field is fragmented and your hypothesis should probably build one. |
| "I'll just label the communities later" | Unlabelled communities are unusable in the hypothesis phase. Label them before handoff. A community called *"Community 3"* is a community that won't be targeted. |
| "I'll skip the visualisation" | Fine — `--no-viz` the pipeline. But still read `GRAPH_REPORT.md` in full. The god-nodes and surprising-connections sections are the payload. |
| "The surprising connections look random, I'll ignore them" | Random-looking connections are where novel hypotheses live. If a cross-community edge is obvious, it's not novel. If it's non-obvious, sit with it until you can articulate why it's there. |
| "I'll add missing raw materials without re-running the graph" | A graph built on a partial corpus has the wrong communities. Always re-run after adding sources. Graphify's `--update` is fast for code but cheap to full-rebuild on a scientific corpus. |

## Anti-Patterns

### Vague community labels
Community labels like *"Research"*, *"Biology"*, *"Methods"* are anti-patterns. Force domain specificity: *"PHQ-9 ecosystem"*, *"Germ-free-mouse mechanisms"*, *"UK Biobank ancestry adjustments"*.

### Ignoring AMBIGUOUS edges
Edges flagged AMBIGUOUS are the signal that the corpus has thin evidence for a connection. Note them in the reading doc — they are hypothesis-quality seeds, because they haven't been ruled in or out.

### God-node-worship
Targeting only god nodes produces incrementalist hypotheses. The best hypotheses often target a node of degree 2 or 3 that bridges two communities — small by graph metrics, large by scientific novelty. Balance both.

### Skipping "what the graph cannot tell you"
Every graph has blind spots. If your raw-materials folder excludes animal studies, human studies, preprints, or a specific methodology, the graph encodes that exclusion. Name the exclusions explicitly in the reading doc so the hypothesizer and experimenter know what the graph is blind to.

### Treating the graph as conclusive
The graph is a summary of what is *in the corpus*, not a summary of what is *true*. It is a map, not the territory. Use it to find where to look. Do not use it as evidence in the hypothesis doc — cite the underlying sources instead.

## Handoff

When the per-round graph reading doc (`graphs/rN.md`) is complete and the artifacts in `graphs/rN/` are written, the orchestrator (`inv-research-cycle`) proceeds to `inv-synthesize`. This skill does not invoke any downstream skill — the orchestrator owns the loop.

The synthesize phase reads `graphs/rN/GRAPH_REPORT.md` and `graphs/rN.md` to identify god nodes / surprising connections that should inform the round's enriched answer and the ranked next-area proposals.

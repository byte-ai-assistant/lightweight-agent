---
name: eng-graphify
description: Use when working in a cloned repo to build, update, or query a knowledge graph for architectural understanding
---

# Knowledge Graph

## The Rule

```
UNDERSTAND BEFORE YOU BUILD. MAP BEFORE YOU NAVIGATE.
```

Before reading individual files, build or update the repo's knowledge graph. The graph shows you the forest — god nodes (architectural pillars), communities (clustered domains), and surprising connections (hidden couplings). Individual files show you trees. You need both.

## Prerequisites

Before first use, check that graphify is installed:

```bash
python3 -c "import graphify" 2>/dev/null || python3 -m pip install graphifyy -q
```

Also ensure networkx is available (installed as a graphify dependency):

```bash
python3 -c "import networkx" 2>/dev/null || python3 -m pip install networkx -q
```

## Build or Update

Every time you start working in a cloned repo, check the graph state and act:

```
IF graphify-out/graph.json exists:
  → run incremental update (fast, code-only changes need zero LLM calls)
ELSE:
  → run full build (first time in this repo)
```

### Full Build (first time)

Run these commands in sequence from the repo root:

**Step 1 — Detect files:**

```bash
mkdir -p graphify-out
python3 -c "
import json
from graphify.detect import detect
from pathlib import Path
result = detect(Path('.'))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(result))
total = result.get('total_files', 0)
words = result.get('total_words', 0)
print(f'Corpus: {total} files, ~{words:,} words')
for ftype in ['code', 'document', 'paper', 'image', 'video']:
    files = result.get('files', {}).get(ftype, [])
    if files:
        print(f'  {ftype}: {len(files)} files')
"
```

If `total_files` is 0, stop — no supported files found.
If `total_files` > 200 or `total_words` > 2,000,000, pick a subfolder to scope down.

**Step 2 — AST extraction (code files, free, no LLM):**

```bash
python3 -c "
import json
from graphify.extract import collect_files, extract
from pathlib import Path

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
code_files = []
for f in detect.get('files', {}).get('code', []):
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])

if code_files:
    result = extract(code_files)
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps(result, indent=2))
    print(f'AST: {len(result[\"nodes\"])} nodes, {len(result[\"edges\"])} edges')
else:
    Path('graphify-out/.graphify_ast.json').write_text(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}))
    print('No code files — skipping AST extraction')
"
```

**Step 3 — Semantic extraction (non-code files):**

Check if there are non-code files (docs, papers, images):

```bash
python3 -c "
import json
from pathlib import Path
detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
non_code = []
for ftype in ['document', 'paper', 'image']:
    non_code.extend(detect.get('files', {}).get(ftype, []))
print(f'{len(non_code)} non-code files')
if non_code:
    for f in non_code:
        print(f'  {f}')
"
```

If non-code files exist, read each file and extract entities yourself. You ARE an LLM — this is exactly what graphify's semantic extraction does, but you do it inline instead of via subagents.

For each non-code file:
1. Read the file content
2. Extract entities (concepts, components, decisions, rationale) and relationships
3. Output JSON matching this schema:

```json
{
  "nodes": [
    {
      "id": "filestem_entityname",
      "label": "Human Readable Name",
      "file_type": "document",
      "source_file": "relative/path"
    }
  ],
  "edges": [
    {
      "source": "node_id",
      "target": "node_id",
      "relation": "references|cites|conceptually_related_to|rationale_for",
      "confidence": "EXTRACTED|INFERRED|AMBIGUOUS",
      "confidence_score": 0.9,
      "source_file": "relative/path",
      "weight": 1.0
    }
  ],
  "hyperedges": [],
  "input_tokens": 0,
  "output_tokens": 0
}
```

Write the combined result to `graphify-out/.graphify_semantic.json`.

If there are NO non-code files (code-only repo), write an empty result:

```bash
python3 -c "
import json
from pathlib import Path
Path('graphify-out/.graphify_semantic.json').write_text(json.dumps({'nodes':[],'edges':[],'hyperedges':[],'input_tokens':0,'output_tokens':0}))
print('Code-only repo — skipping semantic extraction')
"
```

**Step 4 — Merge AST + semantic:**

```bash
python3 -c "
import json
from pathlib import Path

ast = json.loads(Path('graphify-out/.graphify_ast.json').read_text())
sem = json.loads(Path('graphify-out/.graphify_semantic.json').read_text())

seen = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])

merged = {
    'nodes': merged_nodes,
    'edges': ast['edges'] + sem['edges'],
    'hyperedges': sem.get('hyperedges', []),
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('graphify-out/.graphify_extract.json').write_text(json.dumps(merged, indent=2))
print(f'Merged: {len(merged_nodes)} nodes, {len(merged[\"edges\"])} edges')
"
```

**Step 5 — Build graph, cluster, analyze:**

```bash
python3 -c "
import json
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
detection = json.loads(Path('graphify-out/.graphify_detect.json').read_text())

G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: 'Community ' + str(cid) for cid in communities}
questions = suggest_questions(G, communities, labels)

report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '.', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report)
to_json(G, communities, 'graphify-out/graph.json')

analysis = {
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods,
    'surprises': surprises,
    'questions': questions,
}
Path('graphify-out/.graphify_analysis.json').write_text(json.dumps(analysis, indent=2))
print(f'Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
"
```

**Step 6 — Label communities:**

Read `graphify-out/.graphify_analysis.json`. For each community, look at its node labels and assign a 2-5 word plain-language name (e.g., "Auth & Permissions", "Lease Management", "Property CRUD").

Then regenerate the report with labels:

```bash
python3 -c "
import json
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
detection = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text())

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

labels = LABELS_DICT

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, analysis['gods'], analysis['surprises'], detection, tokens, '.', suggested_questions=questions)
Path('graphify-out/GRAPH_REPORT.md').write_text(report)
Path('graphify-out/.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}))
print('Report updated with community labels')
"
```

Replace `LABELS_DICT` with the actual dict you constructed (e.g., `{0: "Auth & Permissions", 1: "Lease Management"}`).

**Step 7 — Generate HTML visualization:**

```bash
python3 -c "
import json
from graphify.build import build_from_json
from graphify.export import to_html
from pathlib import Path

extraction = json.loads(Path('graphify-out/.graphify_extract.json').read_text())
analysis = json.loads(Path('graphify-out/.graphify_analysis.json').read_text())
labels_raw = json.loads(Path('graphify-out/.graphify_labels.json').read_text()) if Path('graphify-out/.graphify_labels.json').exists() else {}

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
labels = {int(k): v for k, v in labels_raw.items()}

if G.number_of_nodes() > 5000:
    print(f'Graph has {G.number_of_nodes()} nodes — too large for HTML viz')
else:
    to_html(G, communities, 'graphify-out/graph.html', community_labels=labels or None)
    print('graph.html written')
"
```

**Step 8 — Save manifest and clean up:**

```bash
python3 -c "
import json
from pathlib import Path
from graphify.detect import save_manifest

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text())
save_manifest(detect['files'])
print('Manifest saved for future --update runs')
"
rm -f graphify-out/.graphify_detect.json graphify-out/.graphify_extract.json graphify-out/.graphify_ast.json graphify-out/.graphify_semantic.json graphify-out/.graphify_analysis.json graphify-out/.graphify_labels.json
```

**Step 9 — Add gitignore entries (first build only):**

If the repo's `.gitignore` does not already contain graphify entries, add:

```
# graphify intermediates
graphify-out/.graphify_*.json
graphify-out/cost.json
```

### Incremental Update

When `graphify-out/graph.json` already exists, run an incremental update:

```bash
python3 -c "
import json
from graphify.detect import detect_incremental
from pathlib import Path

result = detect_incremental(Path('.'))
new_total = result.get('new_total', 0)
if new_total == 0:
    print('No files changed since last run. Graph is current.')
else:
    Path('graphify-out/.graphify_incremental.json').write_text(json.dumps(result))
    print(f'{new_total} new/changed file(s) to re-extract.')
"
```

If no files changed, stop — graph is current.

If files changed, check whether they are code-only:

```bash
python3 -c "
import json
from pathlib import Path

result = json.loads(Path('graphify-out/.graphify_incremental.json').read_text())
code_exts = {'.py','.ts','.js','.go','.rs','.java','.cpp','.c','.rb','.swift','.kt','.cs','.tsx','.jsx','.mjs','.cjs'}
new_files = result.get('new_files', {})
all_changed = [f for files in new_files.values() for f in files]
code_only = all(Path(f).suffix.lower() in code_exts for f in all_changed)
print(f'code_only: {code_only}')
print(f'Changed files: {len(all_changed)}')
"
```

If code-only: run AST extraction on changed files only (zero LLM calls), merge into existing graph, re-cluster, regenerate report. Follow the same Steps 2, 4, 5, 6, 7, 8 from the full build but scoped to changed files.

If mixed (docs changed too): run AST extraction on code files, do semantic extraction yourself on the changed non-code files, merge everything into the existing graph, re-cluster, regenerate.

## Query the Graph

Four query patterns for exploring the codebase. Run from the repo root where `graphify-out/graph.json` exists.

### 1. Broad Exploration (BFS) — "What connects to X?"

```bash
python3 -c "
import json
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text())
G = json_graph.node_link_graph(data, edges='links')

terms = [t.lower() for t in 'SEARCH_TERMS'.split() if len(t) > 3]
scored = sorted(
    [(sum(1 for t in terms if t in G.nodes[n].get('label','').lower()), n) for n in G.nodes()],
    reverse=True
)
start_nodes = [nid for s, nid in scored[:3] if s > 0]

if not start_nodes:
    print('No matching nodes found')
else:
    subgraph = set(start_nodes)
    frontier = set(start_nodes)
    for _ in range(3):
        nxt = set()
        for n in frontier:
            for nb in G.neighbors(n):
                if nb not in subgraph:
                    nxt.add(nb)
        subgraph.update(nxt)
        frontier = nxt

    print(f'Found {len(subgraph)} connected nodes from {[G.nodes[n].get(\"label\",n) for n in start_nodes]}')
    for nid in subgraph:
        d = G.nodes[nid]
        print(f'  {d.get(\"label\", nid)} [{d.get(\"source_file\",\"\")}]')
        for nb in G.neighbors(nid):
            if nb in subgraph:
                e = G.edges[nid, nb]
                print(f'    --{e.get(\"relation\",\"\")}--> {G.nodes[nb].get(\"label\",nb)} [{e.get(\"confidence\",\"\")}]')
"
```

Replace `SEARCH_TERMS` with the concept you're investigating.

### 2. Trace a Path (DFS) — "How does X reach Y?"

```bash
python3 -c "
import json
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text())
G = json_graph.node_link_graph(data, edges='links')

terms = [t.lower() for t in 'SEARCH_TERMS'.split() if len(t) > 3]
scored = sorted(
    [(sum(1 for t in terms if t in G.nodes[n].get('label','').lower()), n) for n in G.nodes()],
    reverse=True
)
start_nodes = [nid for s, nid in scored[:3] if s > 0]

if not start_nodes:
    print('No matching nodes found')
else:
    visited = set()
    stack = [(n, 0) for n in reversed(start_nodes)]
    edges_found = []
    while stack:
        node, depth = stack.pop()
        if node in visited or depth > 6:
            continue
        visited.add(node)
        for nb in G.neighbors(node):
            if nb not in visited:
                stack.append((nb, depth + 1))
                edges_found.append((node, nb))

    print(f'DFS: {len(visited)} nodes reached from {[G.nodes[n].get(\"label\",n) for n in start_nodes]}')
    for u, v in edges_found[:30]:
        e = G.edges[u, v]
        print(f'  {G.nodes[u].get(\"label\",u)} --{e.get(\"relation\",\"\")}--> {G.nodes[v].get(\"label\",v)} [{e.get(\"confidence\",\"\")}]')
"
```

### 3. Shortest Path — "What's between A and B?"

```bash
python3 -c "
import json
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text())
G = json_graph.node_link_graph(data, edges='links')

def find(term):
    t = term.lower()
    scored = sorted(
        [(sum(1 for w in t.split() if w in G.nodes[n].get('label','').lower()), n) for n in G.nodes()],
        reverse=True
    )
    return scored[0][1] if scored and scored[0][0] > 0 else None

src = find('NODE_A')
tgt = find('NODE_B')
if not src or not tgt:
    print('Could not find matching nodes')
else:
    try:
        path = nx.shortest_path(G, src, tgt)
        print(f'Shortest path ({len(path)-1} hops):')
        for i, nid in enumerate(path):
            label = G.nodes[nid].get('label', nid)
            if i < len(path) - 1:
                e = G.edges[nid, path[i+1]]
                print(f'  {label} --{e.get(\"relation\",\"\")}--> [{e.get(\"confidence\",\"\")}]')
            else:
                print(f'  {label}')
    except nx.NetworkXNoPath:
        print('No path found')
"
```

Replace `NODE_A` and `NODE_B` with the concepts you want to connect.

### 4. Node Explanation — "What is X connected to?"

```bash
python3 -c "
import json
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text())
G = json_graph.node_link_graph(data, edges='links')

term = 'NODE_NAME'.lower()
scored = sorted(
    [(sum(1 for w in term.split() if w in G.nodes[n].get('label','').lower()), n) for n in G.nodes()],
    reverse=True
)
if not scored or scored[0][0] == 0:
    print(f'No node matching: {term}')
else:
    nid = scored[0][1]
    d = G.nodes[nid]
    print(f'NODE: {d.get(\"label\", nid)}')
    print(f'  source: {d.get(\"source_file\",\"unknown\")}')
    print(f'  type: {d.get(\"file_type\",\"unknown\")}')
    print(f'  degree: {G.degree(nid)}')
    print()
    for nb in G.neighbors(nid):
        e = G.edges[nid, nb]
        print(f'  --{e.get(\"relation\",\"\")}--> {G.nodes[nb].get(\"label\",nb)} [{e.get(\"confidence\",\"\")}] ({G.nodes[nb].get(\"source_file\",\"\")})')
"
```

Replace `NODE_NAME` with the entity you want to understand.

## Read the Report

For quick orientation, read `graphify-out/GRAPH_REPORT.md` and focus on three sections:

- **God Nodes** — the most connected entities. These are the architectural pillars. If your epic touches a god node, you're touching a critical path — extra care needed.
- **Communities** — clustered domains/modules. Shows you how the codebase is organized at a higher level than directories. Look for which communities your epic will cross.
- **Surprising Connections** — cross-domain couplings that aren't obvious. These are hidden dependencies you must account for in your design. If your epic touches modules that have a surprising connection, investigate before committing to an approach.

## Commit Artifacts

After building or updating, commit these files to the repo:

```bash
git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md graphify-out/graph.html
git commit -m "chore: update knowledge graph"
```

Do NOT commit intermediate files (`graphify-out/.graphify_*.json`, `graphify-out/cost.json`).

## Cross-Repo Reasoning

For `scope:both` epics, build or update graphs in BOTH repos:

1. Clone erp-be, build/update graph, query it
2. Clone erp-fe, build/update graph, query it
3. During technical design, query both graphs to understand how BE changes affect FE
4. After implementation, update the graph in each repo you changed

Each repo has its own graph. Reason across them by querying both.

## Integration Points

- **`eng-technical-design` Step 2:** This skill is loaded during "Explore the Codebase." Build/update the graph, read the report, query for entities related to the epic requirements.
- **`eng-epic-cycle` Phase 3 (after 3f):** After all stories are committed, run `graphify --update` and commit the graph artifacts.
- **`eng-debug`:** When investigating a bug, query the graph to trace connections, find unexpected dependencies, or identify cross-module couplings.

## Rationalization Table

| Rationalization | Reality |
|---|---|
| "I already know this codebase" | You know what you've seen. The graph shows what you haven't. |
| "The repo is small, no need for a graph" | Small repos have hidden couplings too. 30 seconds to build, saves 30 minutes of wrong assumptions. |
| "I'll just read the files directly" | Reading files shows you trees. The graph shows you the forest. Do both. |
| "graphify --update is slow" | Code-only updates need zero LLM calls. It takes seconds. |
| "I'll build the graph after I'm done" | The graph helps you design. Building it after implementation misses the point. Build it first. |
| "I don't need to update the graph after my changes" | The next engineer (or your next session) will work with a stale graph. 10 seconds to update vs future confusion. |
| "Only one repo matters for this epic" | scope:both means both repos. Hidden FE dependencies on your BE changes won't show up in one graph. |

## Red Flags — STOP

- About to start technical design without checking for a graph
- Reading individual files without first understanding the architecture map
- Skipping `--update` after implementation because "I know what I changed"
- Working on a `scope:both` epic but only building a graph in one repo
- Querying the graph but ignoring surprising connections in the results

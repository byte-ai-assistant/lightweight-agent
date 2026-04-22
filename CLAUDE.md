# Lightweight Agent

Shareable AI assistant starter built with the Claude Agent SDK, Next.js, Express, memory, skills, and cron tools.

## Development

- `npm run dev`
- `npm run build`
- `npx tsc --project tsconfig.server.json --noEmit`

## Working Rules

- Do not commit `.env.local`, `data/`, `node_modules/`, `dist/`, or `.next/`
- Keep example memory generic and safe to publish
- Prefer adding reusable skills over project-specific one-offs

## File locations

- The agent's default output root is this project root. Bare/relative paths in agent-written files (e.g. `docs/sci/research/foo.md`) resolve here, never in the user's home.
- `docs/` under this root is the scratch/output tree for notes, research artifacts, and reports. Skills that write outputs (e.g. `sci-research`, `sci-hypothesize`) should use relative paths like `docs/sci/...`.
- External project work (e.g. `erp-be`, `erp-fe`, or any project listed on the project board with its own `location`) must be opted into explicitly by a skill or by the user naming an absolute path / project name. Never write outside this root by default.

## Structure

- `src/` — app and agent source
- `src/agent/skills/bundled/` — bundled skill packs (shared across all agent instances)
- `profile/` — agent-specific persona, memory, skills, and runtime state (separate git repo)
- `data/` — runtime state, created locally

## Bundled Skills (v2 Architecture)

The following skills are bundled with the framework and available to all agent instances. Each agent's dispatcher (`eng-agent`, `pm-agent`, `qa-agent`) loads the relevant skills based on its state machine.

### Engineering Skills (Jeff)
- `eng-agent` — State machine dispatcher (3 states)
- `eng-epic-cycle` — Full epic orchestrator: design → plan → TDD → verify → self-review → PR
- `eng-technical-design` — Explore 2-3 technical approaches before committing
- `eng-write-plan` — Zero-placeholder granular implementation plans
- `eng-tdd` — Test-driven development (iron law: no code without failing test)
- `eng-verify` — Mandatory verification (test + build + lint) before any completion claim
- `eng-self-review` — Two-pass review: spec compliance + code quality with automated checks
- `eng-receive-review` — Evaluate review feedback against codebase before implementing
- `eng-debug` — Systematic 4-phase debugging framework

### PM Skills (Sparky)
- `pm-agent` — State machine dispatcher (4 cron states + Telegram brainstorming)
- `pm-brainstorm` — Product brainstorming via Telegram (zero GitHub artifacts until complete)
- `pm-process-intake` — Fallback processing for orphaned requests/bugs
- `pm-assign` — Backlog priority assignment
- `pm-unblock` — Resolve blocked issues with human replies
- `pm-close-epic` — Epic acceptance and closure

### QA Skills (Merlin)
- `qa-agent` — State machine dispatcher (2 states)
- `qa-structural-audit` — 6-pass structural review (security, data integrity, DB, API, tests, architecture)
- `qa-deployment-triage` — Vercel deployment monitoring and bug creation

### Science Skills (human-invoked research)
- `sci-agent` — Human-invoked dispatcher (4 states); routes fresh questions through the full cycle
- `sci-research-cycle` — Orchestrator: literature survey → knowledge graph → hypothesis, with user gates
- `sci-research` — Sourced literature/dataset/replication survey; saves raw materials to `docs/sci/raw/<topic>/`
- `sci-graphify` — Builds a knowledge graph via graphify from the raw materials; identifies god nodes, communities, and surprising cross-community bridges that seed novel hypotheses
- `sci-hypothesize` — Turns research + graph insights into falsifiable hypotheses with predicted effect size, mechanism, pre-specified kill criteria, and ruled-out alternatives

## Cron & Preflight Architecture

- **Cron jobs** (`profile/data/cron-jobs.json`): scheduled recurring prompts that trigger the agent's state machine
- **Preflight gates** (`profile/data/preflight-gates.json`): lightweight shell checks that run BEFORE invoking the LLM. If no check passes, the agent is never invoked — zero token cost.
- **Concurrency guard**: in-memory `runningJobs` Set prevents concurrent runs of the same cron job. Long-running sessions (Jeff's 1-2 hour epic cycles) silently skip subsequent ticks.
- **Session lifecycle**: cron sessions are deleted each run (stateless). Telegram sessions persist up to 24h/100 messages.

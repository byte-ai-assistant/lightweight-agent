---
name: qa-deployment-triage
description: Use when a Vercel dev deployment is in error state and no existing bug issue exists for the same commit
---

# Deployment Triage

## When This Runs

Cron state: Vercel `dev` deployment is in error state AND no existing `type:bug` issue references the same commit SHA.

## Process

### 1. Gather Information

```bash
# Get latest dev deployment status
vercel ls --scope sparkiq --environment production 2>/dev/null || echo "Check Vercel dashboard"
```

Collect:
- Deployment URL and commit SHA
- Error type: build error, runtime error, or infrastructure error
- Error message and stack trace
- Which files/modules are involved

### 2. Classify the Error

| Error Type | Indicators | Action |
|-----------|-----------|--------|
| **Build error** | TypeScript compilation failure, missing dependency, import error | Create `type:bug` — likely a code issue that slipped through review |
| **Runtime error** | 500 errors, unhandled exceptions, timeout | Create `type:bug` — code compiles but fails at runtime |
| **Infrastructure error** | DNS, certificate, Vercel platform issue | Do NOT create a bug. Notify CTO via Telegram. |
| **Environment error** | Missing env var, wrong database URL | Do NOT create a bug. Notify CTO via Telegram with the specific env var. |

### 3. Create Bug (for code errors only)

Create a `type:bug` issue in the appropriate repo:

```markdown
Title: [Deployment] Build/runtime error: [brief description]

## Error
[Exact error message and stack trace]

## Context
- Commit: [SHA]
- Deployment: [URL]
- Environment: dev
- Module: [affected module if identifiable]

## Likely Cause
[Your assessment based on the error]
```

Labels: `type:bug`, `scope:[backend|frontend]`, `status:backlog`

### 4. Notify

- Post on Telegram: "Dev deployment failing. Created bug #N: [description]"
- If the error appears to be from a recently merged PR, @mention the PR author in the bug issue

## Rules

- Do NOT create duplicate bugs. Always check if a bug for the same commit/error already exists.
- Do NOT attempt to fix the code. You are a QA agent, not a dev agent. Create the bug and let Jeff fix it.
- Do NOT create bugs for infrastructure issues. Those go to the CTO via Telegram.
- One action per cron run. If multiple deployments are failing, triage the most recent one.

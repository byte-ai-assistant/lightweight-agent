---
name: pm-process-intake
description: Use when a type:request or type:bug issue exists with no status label — fallback for requests not processed via Telegram brainstorming
---

# Process Intake

## When This Runs

This is a cron fallback state. It fires when:
- A `type:request` issue exists with no `status:` label (CEO dropped a request and left)
- A `type:bug` issue exists with no `status:` label (bug reported but not triaged)

These issues were created either by the Telegram handler as a fallback or by a human directly on GitHub.

## Process

### For `type:request`:

1. Read the request issue body
2. Load `product-context` skill
3. Determine scope: `scope:both`, `scope:backend`, or `scope:frontend`
4. If the request has enough detail to create an epic:
   - Create a new `type:epic` issue with structured requirements (goal, scope, acceptance criteria, BE/FE requirements)
   - Set labels: `type:epic`, `scope:*`, `status:backlog`
   - Close the original `type:request` issue with a reference to the new epic
5. If the request is too vague to create an epic:
   - Post a comment on the issue asking for clarification
   - Set `status:blocked` on the request
   - Notify via Telegram: "Request #N needs more detail before I can create an epic"

### For `type:bug`:

1. Read the bug issue body
2. Assess severity and scope
3. Add `status:backlog` label
4. If critical (data loss, security, production down): notify via Telegram immediately

## One Action Per Cron Run

Process ONE intake item per run. The state machine evaluates states top-to-bottom and takes exactly one action.

---
name: pm-state-3-assign
description: "PM state machine — STATE 3: Assign next item from backlog to dev. Uses PM judgment for prioritization."
user-invocable: false
---

# STATE 3 — Assign next from backlog

Nothing is `status:in-development`, and at least one `type:epic` or `type:bug` with `status:backlog` exists. For bugs, this state fires even when `status:awaiting-acceptance` exists (bugs bypass the acceptance queue). For epics, `status:awaiting-acceptance` must also be clear. Now decide what to assign next.

## Action

1. List all backlog items across both repos:
   ```bash
   for REPO in "$FRONTEND_REPO" "$BACKEND_REPO"; do
     gh issue list --repo $REPO \
       --label "status:backlog" --state open \
       --json number,title,url,labels,createdAt,body
   done
   ```

2. If only one item → assign it. Skip to step 4.

3. If multiple items → use PM judgment to prioritize. Load `product-context` for roadmap awareness. Consider:
   - **Bugs vs features:** Bugs are defects affecting users — generally higher urgency
   - **Business value:** Which item delivers the most user-visible value?
   - **Dependencies:** Does item A unblock item B?
   - **CEO recency:** More recent requests may reflect current priorities
   - **Roadmap alignment:** Which item fits the current product phase?

   If the priority is **clear** → assign the highest-priority item.
   If the priority is **unclear** (e.g., two unrelated epics of similar value) → escalate to CEO:
   ```bash
   gh issue create --repo $BACKEND_REPO \
     --title "Awaiting priorities — multiple backlog items" \
     --body "$(cat <<'EOF'
   Pipeline is clear and there are multiple items in the backlog. Need direction on which to tackle first:

   ITEM_LIST_WITH_LINKS

   @$CEO_HANDLE — which should we prioritize?
   EOF
   )" \
     --label "type:spike,status:awaiting-human"
   ```
   Send Telegram notification asking for prioritization.
   **Stop after escalating.** Do not assign anything.

4. Assign the chosen item to dev with `status:in-development`:
   ```bash
   gh issue edit $ISSUE_NUM --repo $REPO \
     --assignee "$DEV_AGENT_HANDLE" \
     --remove-label "status:backlog" \
     --add-label "status:in-development"
   ```

5. Post on the issue:
   ```
   @$DEV_AGENT_HANDLE — this is your next assignment. [For epics: Please plan and decompose. For bugs: Please investigate and fix.]
   ```

6. Send Telegram notification:
   *"Assigned [Epic/Bug] #N to dev — [title]. [Brief rationale for the priority choice if multiple items were in backlog.]"*

## Notes

- Only assign ONE item per cron run.
- For epics: Jeff will detect the assignment via his STATE 2 (plan epic) on the next cycle.
- For bugs: Jeff will detect via his STATE 3 (assigned story/bug with no PR).
- Never assign multiple items simultaneously. Jeff works one item at a time.

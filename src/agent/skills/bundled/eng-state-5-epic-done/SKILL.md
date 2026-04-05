---
name: eng-state-5-epic-done
description: "Eng state machine — STATE 5: All stories done. Mark epic complete and update repo context skills."
user-invocable: false
---

# STATE 5 — All stories done, mark epic complete

You have an open `type:epic` assigned to you where all story sub-issues are `status:done`. Now mark the epic complete and update your repo knowledge base.

## Action

1. Verify all stories are done:
   ```bash
   gh api repos/$EPIC_REPO/issues/$EPIC_NUM \
     --jq '{total: .sub_issues_summary.total, completed: .sub_issues_summary.completed}'
   ```
   Confirm `completed == total` AND `total > 0`.

2. Remove `status:in-development` from the epic:
   ```bash
   gh issue edit $EPIC_NUM --repo $EPIC_REPO \
     --remove-label "status:in-development"
   ```

3. Post a completion comment on the epic:
   ```bash
   gh issue comment $EPIC_NUM --repo $EPIC_REPO \
     --body "All stories implemented and merged to dev. Epic is ready for PM to close.

   ## Summary
   [List each story number + title + what was delivered]

   ## What Changed
   - **Backend:** [new modules, endpoints, schema changes]
   - **Frontend:** [new pages, components, UI changes]"
   ```

4. Notify the PM:
   ```
   @$PM_AGENT_HANDLE — Epic #$EPIC_NUM is complete. All stories merged to dev.
   ```

## Update Repo Context Skills

After posting the completion comment, update the relevant repo context skill(s) with changes introduced by this epic. This keeps the knowledge base fresh for future planning.

1. Review what was built across all stories in this epic.

2. If **backend changes** were made, update `be-repo-context`:
   - Add new tables/columns to the schema summary
   - Add new API endpoints to the module map
   - Add new patterns or conventions if any were introduced
   - Update the `last-updated` field in frontmatter

3. If **frontend changes** were made, update `fe-repo-context`:
   - Add new pages/routes to the page inventory
   - Add new components to the component list
   - Add new hooks or patterns if any were introduced
   - Update the `last-updated` field in frontmatter

4. Use the `write_file` tool to update the skill files at:
   - `profile/skills/be-repo-context/SKILL.md`
   - `profile/skills/fe-repo-context/SKILL.md`

**Keep updates concise.** Add what's new — don't rewrite the entire skill. The goal is incremental maintenance, not a full audit.

## Notes

- Do NOT close the epic. Closing is the PM agent's responsibility (Sparky STATE 4).
- Do NOT create new issues or assign new work. The PM handles what comes next.
- The repo context update is important — it directly improves the quality of future implementation plans.

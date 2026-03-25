---
name: github-projects
description: Plan, track, and overview engineering work with GitHub Issues and Projects v2. Use when the user asks to create issues, manage project boards, plan sprints, triage work, update statuses, or get a status overview of engineering progress.
metadata:
  openclaw:
    category: "project-management"
    requires:
      bins:
        - gh
---

# GitHub Issues & Projects v2

This skill covers the full engineering workflow: creating issues in repos and managing them on project boards.

**Two layers:**
- **Repo issues** — live in a repository, have title, body, assignees, labels, milestones. Managed via `gh` CLI.
- **Project items** — rows on a project board that wrap an issue (or PR/draft). Add board-specific fields: Status, Priority, Iteration, Estimate. Managed via GraphQL.

When you add an issue to a project, assignee/label changes on the issue automatically reflect in the project. But Status, Priority, and Iteration only exist on the project item.

---

## Issue Management (gh CLI)

### Create an Issue

```bash
gh issue create --repo owner/repo \
  --title "Fix login timeout on mobile" \
  --body "Users on iOS report 30s timeout during OAuth flow." \
  --assignee username \
  --label "bug,priority:high"
```

### List and Search Issues

```bash
# Open issues with a label
gh issue list --repo owner/repo --state open --label "bug"

# Search across repos
gh search issues "timeout oauth" --repo owner/repo --state open
```

### View Issue Details

```bash
gh issue view 123 --repo owner/repo
gh issue view 123 --repo owner/repo --json title,state,assignees,labels,projectItems
```

### Edit an Issue

```bash
gh issue edit 123 --repo owner/repo \
  --add-assignee username \
  --add-label "in-progress" \
  --milestone "v2.1"
```

### Close an Issue

```bash
gh issue close 123 --repo owner/repo --reason completed
```

### Get Issue Node ID (needed to add to project)

```bash
gh issue view 123 --repo owner/repo --json id -q .id
```

---

## GraphQL Shell Pattern

GitHub Projects v2 is **GraphQL-only**. All project board operations use:

```bash
gh api graphql -f query='
  <QUERY_OR_MUTATION>
'
```

Pass variables with `-f` (strings) or `-F` (integers/booleans):

```bash
gh api graphql -f query='
  query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) { id title }
    }
  }
' -f org="my-org" -F number=1
```

Pipe through `jq` to extract values.

---

## Project Board — Querying

### Find a Project ID

**Organization project:**

```bash
gh api graphql -f query='
  query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) { id title url }
    }
  }
' -f org="my-org" -F number=1
```

**User project:** Replace `organization(login: $org)` with `user(login: $user)`.

### List Projects

```bash
gh api graphql -f query='
  query($org: String!) {
    organization(login: $org) {
      projectsV2(first: 20) {
        nodes { id title number url closed }
      }
    }
  }
' -f org="my-org"
```

### Get Field IDs and Options (Critical)

You **MUST** query field IDs before updating any field. Single-select and iteration fields require option/iteration IDs.

```bash
gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field {
              id
              name
              dataType
            }
            ... on ProjectV2IterationField {
              id
              name
              configuration {
                iterations { id title startDate duration }
                completedIterations { id title startDate duration }
              }
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              options { id name description color }
            }
          }
        }
      }
    }
  }
' -f projectId="PROJECT_ID"
```

Common fields:

| Field | Type | Notes |
|-------|------|-------|
| Title | `ProjectV2Field` | Built-in, always exists |
| Status | `ProjectV2SingleSelectField` | Options like Todo, In Progress, Done |
| Priority | `ProjectV2SingleSelectField` | Options like P0, P1, P2 |
| Iteration | `ProjectV2IterationField` | Sprint/cycle tracking |
| Estimate | `ProjectV2Field` | Number field for story points |
| Due date | `ProjectV2Field` | Date field |

### Query Project Items

```bash
gh api graphql -f query='
  query($projectId: ID!, $cursor: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2Field { name } }
                }
                ... on ProjectV2ItemFieldDateValue {
                  date
                  field { ... on ProjectV2Field { name } }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  optionId
                  field { ... on ProjectV2SingleSelectField { name } }
                }
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field { ... on ProjectV2Field { name } }
                }
                ... on ProjectV2ItemFieldIterationValue {
                  title
                  startDate
                  duration
                  iterationId
                  field { ... on ProjectV2IterationField { name } }
                }
              }
            }
            content {
              ... on DraftIssue {
                title
                body
              }
              ... on Issue {
                title
                number
                url
                state
                assignees(first: 5) { nodes { login } }
                labels(first: 5) { nodes { name } }
              }
              ... on PullRequest {
                title
                number
                url
                state
                assignees(first: 5) { nodes { login } }
              }
            }
          }
        }
      }
    }
  }
' -f projectId="PROJECT_ID"
```

Use `after: $cursor` with `pageInfo.endCursor` to paginate large projects.

---

## Project Board — Mutations

### Add an Issue or PR to a Project

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {
      projectId: $projectId
      contentId: $contentId
    }) {
      item { id }
    }
  }
' -f projectId="PROJECT_ID" -f contentId="ISSUE_OR_PR_NODE_ID"
```

### Add a Draft Issue

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $title: String!, $body: String) {
    addProjectV2DraftIssue(input: {
      projectId: $projectId
      title: $title
      body: $body
    }) {
      projectItem { id }
    }
  }
' -f projectId="PROJECT_ID" -f title="Investigate flaky CI tests" -f body="Intermittent failures in auth suite"
```

### Update Field Values

**Single-select (Status, Priority):**

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }) {
      projectV2Item { id }
    }
  }
' -f projectId="PROJECT_ID" -f itemId="ITEM_ID" -f fieldId="FIELD_ID" -f optionId="OPTION_ID"
```

**Text field:**

```bash
# Same mutation, use value: { text: $value }
' -f value="Some text"
```

**Number field:**

```bash
# Same mutation, use value: { number: 5 }
# Pass with -F for integer: -F number=5
```

**Date field:**

```bash
# Same mutation, use value: { date: $date }
' -f date="2026-04-01"
```

**Iteration field:**

```bash
# Same mutation, use value: { iterationId: $iterationId }
' -f iterationId="ITERATION_ID"
```

### Clear a Field Value

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
    clearProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
    }) {
      projectV2Item { id }
    }
  }
' -f projectId="PROJECT_ID" -f itemId="ITEM_ID" -f fieldId="FIELD_ID"
```

### Delete an Item from a Project

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!) {
    deleteProjectV2Item(input: {
      projectId: $projectId
      itemId: $itemId
    }) {
      deletedItemId
    }
  }
' -f projectId="PROJECT_ID" -f itemId="ITEM_ID"
```

### Create a New Project

```bash
# First get the owner node ID
gh api graphql -f query='{ organization(login: "my-org") { id } }'

# Then create the project
gh api graphql -f query='
  mutation($ownerId: ID!, $title: String!) {
    createProjectV2(input: {
      ownerId: $ownerId
      title: $title
    }) {
      projectV2 { id number url }
    }
  }
' -f ownerId="OWNER_NODE_ID" -f title="Q2 2026 Roadmap"
```

### Update Project Settings

```bash
gh api graphql -f query='
  mutation($projectId: ID!, $title: String, $shortDescription: String, $readme: String, $public: Boolean) {
    updateProjectV2(input: {
      projectId: $projectId
      title: $title
      shortDescription: $shortDescription
      readme: $readme
      public: $public
    }) {
      projectV2 { id title url }
    }
  }
' -f projectId="PROJECT_ID" -f title="Q2 2026 Roadmap" -f shortDescription="Engineering priorities" -F public=true
```

---

## End-to-End Workflows

### Create and Track

```bash
# 1. Create the issue in the repo
gh issue create --repo owner/repo --title "Add rate limiting" --body "..." --label "feature" --assignee dev1

# 2. Get the issue node ID
ISSUE_ID=$(gh issue view 42 --repo owner/repo --json id -q .id)

# 3. Add to project
ITEM_ID=$(gh api graphql -f query='
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item { id }
    }
  }
' -f projectId="$PROJECT_ID" -f contentId="$ISSUE_ID" | jq -r '.data.addProjectV2ItemById.item.id')

# 4. Set status and priority (using field/option IDs from earlier query)
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
      value: { singleSelectOptionId: $optionId }
    }) { projectV2Item { id } }
  }
' -f projectId="$PROJECT_ID" -f itemId="$ITEM_ID" -f fieldId="$STATUS_FIELD_ID" -f optionId="$TODO_OPTION_ID"
```

### Triage

1. Query all project items
2. Review items without a status or marked as "Triage"
3. For each: set Status (Todo/In Progress/Won't Fix) and Priority (P0-P3)

### Sprint Planning

1. Query field IDs to get the current iteration ID
2. Query backlog items (Status = Todo or Ready)
3. For each selected item, set the Iteration field to the current sprint

### Status Overview

Query all items, group by Status field, and summarize:

```
Todo:         12 items (3 P0, 5 P1, 4 P2)
In Progress:   5 items (2 P0, 3 P1)
In Review:     3 items
Done:          8 items (this iteration)
Blocked:       2 items
```

---

## Important Constraints

| Constraint | Details |
|-----------|---------|
| **Query field IDs first** | You MUST query field IDs and option IDs before any update. Option IDs are opaque strings — never guess them. |
| **Separate add and update** | Cannot add an item and set fields in one mutation. First add, then update. |
| **Assignees, labels, milestones** | These live on the Issue/PR, not the project item. Use `gh issue edit` to modify them. |
| **Pagination** | Projects with 100+ items need cursor-based pagination via `pageInfo`. |
| **Rate limits** | GraphQL has point-based rate limits. Batch reads; avoid tight mutation loops. |
| **Permissions** | Token needs `project` scope (classic PAT) or Projects read/write (fine-grained). |

---

## Best Practices

- **Break down large issues** into smaller deliverables (a few days each). Use sub-issues for hierarchy.
- **Use fields strategically** — Priority, Estimate, Due Date, and custom fields like Team or Component enable useful grouping and filtering.
- **Create focused views** — board view for sprint work, table view for backlog grooming, roadmap view for timeline planning.
- **Single source of truth** — update status in the project, not scattered across issue comments.
- **Use iterations** for sprint/velocity planning — compare estimated vs. completed points per iteration.
- **Archive done items** regularly to keep active views clean.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Could not resolve to a ProjectV2` | Wrong project number or insufficient permissions | Verify project number in URL; check token scopes |
| `Field not found` | Using field name instead of field ID | Query field IDs first |
| `Invalid single select option` | Using option name instead of option ID | Query the single-select field for option IDs |
| `Resource not accessible` | Token lacks project scope | Add `project` scope to PAT |
| Empty `items.nodes` | No items or pagination needed | Check `pageInfo.hasNextPage` |
| `gh: Not Found (HTTP 404)` | `gh` CLI not authenticated | Run `gh auth status` then `gh auth login` |

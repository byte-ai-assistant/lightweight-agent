---
name: web-search
description: Search the web using Exa. Use when the user asks to search the web, look up current information, find documentation, research companies, find people, or get news. Triggers on requests like "search for", "look up", "find articles about", "what's the latest on", "research this company", or any query needing real-time web information.
metadata:
  openclaw:
    requires:
      env:
        - EXA_API_KEY
---

# Web Search with Exa

You have access to Exa web search tools via MCP. Use them for real-time web information, documentation lookup, code examples, company research, and news.

## Available Tools

- **web_search_exa** — General web search (use this most of the time)
- **web_search_advanced_exa** — Advanced search with filters (domains, date ranges, categories)
- **get_code_context_exa** — Find code examples and documentation
- **crawling_exa** — Extract content from known URLs
- **company_research_exa** — Research companies
- **people_search_exa** — Find people by role or expertise
- **deep_researcher_start** / **deep_researcher_check** — Multi-step deep research

## Search Types

| Type | Best For | Speed |
|------|----------|-------|
| `auto` | Most queries — balanced relevance and speed | ~1s |
| `fast` | Quick lookups, autocomplete | Fastest |
| `deep` | Thorough research, enrichment | Slow |
| `deep-reasoning` | Complex multi-step reasoning | Slowest |

Default to `type: "auto"`. Use `type: "deep"` only when thorough research is needed.

## Content Configuration

Choose ONE content type per request (not both):

| Type | Config | Best For |
|------|--------|----------|
| Highlights | `"highlights": {"max_characters": 4000}` | Snippets, summaries, lower cost |
| Text | `"text": {"max_characters": 20000}` | Full content extraction, RAG |

Prefer **highlights** to keep token usage low. Only use **text** when full content is needed (code snippets, full articles, documentation).

## Category Filters

Use categories to search dedicated indexes. Each returns only that content type.

- `"news"` — News articles. Use `maxAgeHours: 24` for breaking news.
- `"research paper"` — Academic papers (arxiv, paperswithcode, etc.)
- `"company"` — Find companies by industry or attributes (singular form, simple queries)
- `"people"` — Find people by role or expertise (singular form, no date/text filters)
- `"tweet"` — Tweets

If results are too narrow, try searching without a category first.

## Domain Filtering

Usually not needed — Exa's neural search finds relevant results without restrictions.

```json
{
  "includeDomains": ["arxiv.org", "github.com"],
  "excludeDomains": ["pinterest.com"]
}
```

## Content Freshness (maxAgeHours)

Controls how fresh cached content must be before livecrawling.

| Value | Behavior |
|-------|----------|
| *(omit)* | Default — cache when available, livecrawl as fallback (recommended) |
| `24` | Livecrawl if cache is older than 24 hours |
| `0` | Always livecrawl (ignore cache) |
| `-1` | Cache only, never livecrawl (fastest) |

## Troubleshooting — Common Mistakes

- `useAutoprompt` — **deprecated**, remove it
- `includeUrls` / `excludeUrls` — **do not exist**, use `includeDomains` / `excludeDomains`
- `stream: true` — **not supported** on /search or /contents
- `livecrawl` — **deprecated**, use `maxAgeHours` instead
- `numSentences`, `highlightsPerUrl` — **deprecated**, use `maxCharacters`
- `text`/`highlights` on /search — **must be nested** inside `contents` (e.g., `"contents": {"highlights": {...}}`)

## Tips

- Use singular form for category queries ("software engineer", not "software engineers")
- Reduce `num_results` and skip contents if you only need URLs
- Remove filters (date, domain) if getting no results
- For known URLs, use **crawling_exa** to extract content directly

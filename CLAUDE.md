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

## Structure

- `src/` — app and agent source
- `memory/` — starter memory files
- `skills/` — local skill packs
- `data/` — runtime state, created locally

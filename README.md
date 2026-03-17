# Lightweight Agent

Lightweight Agent is a shareable starter repo for building your own local AI assistant with the Claude Agent SDK.

It includes:

- A web chat UI
- A Telegram bot
- Persistent Claude sessions
- File-based long-term memory with a SQLite index
- Chat history search
- Projects and tasks
- Scheduled cron jobs
- Optional Google Workspace tools
- Optional audio transcription and TTS
- A local skills system

This repo is intentionally generic. It does not ship with personal memory, private credentials, client data, or project-specific automations.

## Who This Is For

Use this repo if you want a practical starting point for your own AI operator or personal assistant that runs locally and can be adapted to your workflows.

## Stack

- TypeScript
- Node.js
- Next.js
- Express
- `@anthropic-ai/claude-agent-sdk`
- SQLite via `better-sqlite3`
- Telegram via `node-telegram-bot-api`
- Zod for tool schemas

## Features

### Web chat

Start the app and open `http://localhost:3000`.

The browser UI sends requests to `POST /api/chat`, which forwards them to the same agent runtime used by Telegram and scheduled jobs.

### Telegram bot

If you set `TELEGRAM_BOT_TOKEN`, the app starts a polling Telegram bot.

Supported:

- Text messages
- Voice/audio messages
- Per-user request queueing
- Optional voice replies

### Persistent sessions

The agent persists per-user Claude sessions in `data/sessions.json`.

By default, sessions are expired after:

- 24 hours of inactivity
- 100 messages

When a session expires, the agent consolidates the conversation into durable memory.

### Long-term memory

Memory files live in `memory/*.qmd`.

The app indexes them into `data/memory-index.sqlite` using SQLite FTS and optional OpenAI embeddings. Relevant memories are automatically retrieved into the prompt.

### Projects and tasks

The repo includes a simple project board stored in `data/projects.json`.

The agent can:

- Create projects
- Update projects
- Add tasks
- Update tasks
- Delete tasks

### Cron jobs

The agent can create scheduled jobs that run prompts through the agent on a cron schedule.

Example use cases:

- Daily summaries
- Weekly planning
- Inbox triage
- Recurring reminders

### Skills

Skills are Markdown instruction bundles stored under `skills/<name>/SKILL.md`.

The agent can discover available skills and load one on demand using the built-in `load_skill` tool.

## Quick Start

1. Clone the repo.
2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

4. Fill in the values you want to enable.

5. Start the app:

```bash
npm run dev
```

6. Open:

- Web UI: `http://localhost:3000`
- Chat API: `POST /api/chat`

## Environment

The repo supports a minimal setup and several optional integrations.

### Required or strongly recommended

- Claude SDK authentication in your local environment
- `OPENAI_API_KEY` if you want memory embeddings and Whisper transcription

### Optional

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USERS`
- `ELEVEN_LABS_API_KEY`
- `ELEVEN_LABS_VOICE_ID`
- `WHISPER_MODEL`
- `PORT`

See `.env.example` for the full list.

## Optional Integrations

### Google Workspace

The Google tools shell out to the `gws` CLI for:

- Gmail
- Calendar
- Drive
- Docs
- Sheets
- Tasks
- Contacts

Setup:

1. Install `gws`
2. Run `gws auth login`
3. Confirm the binary path in `src/agent/tools/google.ts`

The current code expects `gws` at `/opt/homebrew/bin/gws`.

### Audio transcription

Telegram audio transcription uses OpenAI Whisper and `ffmpeg`.

You need:

- `OPENAI_API_KEY`
- `ffmpeg`

### Voice replies

Voice replies use ElevenLabs plus `ffmpeg`.

You need:

- `ELEVEN_LABS_API_KEY`
- `ffmpeg`

The current TTS path expects `ffmpeg` at `/opt/homebrew/bin/ffmpeg`.

## Repo Layout

- `src/server.ts`: server bootstrap
- `src/agent/index.ts`: main agent runtime
- `src/agent/tools/`: tool implementations
- `src/agent/memory/`: memory indexing and retrieval
- `src/agent/skills/`: skill loading and config
- `src/telegram/bot.ts`: Telegram bot
- `src/app/`: Next.js UI and API route
- `memory/`: starter memory files
- `skills/`: workspace skills
- `data/`: runtime state, created locally

## Making It Your Own

The intended customization points are:

- `memory/base-context.qmd`
- `memory/goals.qmd`
- `memory/people.qmd`
- `memory/projects.qmd`
- `skills/`
- the system prompt in `src/agent/index.ts`
- tool implementations in `src/agent/tools/`

## Security Notes

- Do not commit `.env.local`
- Do not commit `data/`
- Do not expose this app publicly without adding authentication
- The agent has broad local tool access and should run only in an environment you trust

## Suggested Next Steps

- Replace the starter memory files with your own context
- Add or remove tools based on your needs
- Add auth before exposing the web UI
- Add tests for critical workflows
- Point the Google and `ffmpeg` paths to your own environment if needed

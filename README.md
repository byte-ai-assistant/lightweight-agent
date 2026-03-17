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

## Step-By-Step Setup

### 1. Clone the repo

```bash
git clone https://github.com/byte-ai-assistant/lightweight-agent.git
cd lightweight-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Make sure Claude SDK auth works on your machine

This app uses the Claude Agent SDK as the core agent runtime.

Before running the app, make sure your local environment already has working Claude authentication.

Copy-paste check:

```bash
printenv ANTHROPIC_API_KEY
```

If that prints a real key, you can use it in `.env.local` like this:

```bash
cp .env.example .env.local
printf '\nANTHROPIC_API_KEY=%s\n' "$ANTHROPIC_API_KEY" >> .env.local
```

If it prints nothing, set the key manually in `.env.local`:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Then verify the file contains it:

```bash
grep '^ANTHROPIC_API_KEY=' .env.local
```

### 4. Create your local env file

```bash
cp .env.example .env.local
```

Then edit `.env.local`.

Minimum useful setup:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
```

Recommended additions if you want Telegram:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ALLOWED_USERS=123456789
```

Recommended additions if you want voice replies:

```env
ELEVEN_LABS_API_KEY=your_elevenlabs_key
ELEVEN_LABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

### 5. Optional: install `ffmpeg`

`ffmpeg` is needed for:

- Telegram voice/audio transcription
- ElevenLabs voice reply conversion

On macOS with Homebrew:

```bash
brew install ffmpeg
```

Important:

- `src/lib/elevenlabs.ts` currently expects `ffmpeg` at `/opt/homebrew/bin/ffmpeg`
- if your `ffmpeg` binary is elsewhere, update that path

### 6. Optional: install and authenticate `gws`

If you want Gmail, Calendar, Drive, Docs, Sheets, Tasks, or Contacts tools:

1. Install `gws`
2. Run:

```bash
gws auth login
```

3. Confirm it works in your shell
4. Check the path in `src/agent/tools/google.ts`

Important:

- the current code expects `gws` at `/opt/homebrew/bin/gws`
- if your `gws` binary is elsewhere, update that path

### 7. Customize the starter memory

Edit these files before heavy use:

- `memory/base-context.qmd`
- `memory/goals.qmd`
- `memory/people.qmd`
- `memory/projects.qmd`
- `memory/decisions.qmd`

At minimum, update:

- your name or role
- your timezone
- your communication preferences
- your current projects and priorities

### 8. Start the app

```bash
npm run dev
```

You should see logs similar to:

- `Lightweight Agent running on http://localhost:3000`
- `Web UI: http://localhost:3000`
- `Chat API: POST http://localhost:3000/api/chat`
- `Telegram: Active (polling)` if Telegram is enabled

### 9. Open the web UI

Go to:

```text
http://localhost:3000
```

Send a simple message like:

- `What tools do you have?`
- `Create a project called Personal OS and add three tasks`
- `What do you know about my goals?`

### 10. Optional: test the Telegram bot

If Telegram is configured:

1. Open your bot in Telegram
2. Send a text message
3. Confirm you receive a response

If it does not reply, check:

- your bot token
- your allowed user ID
- server logs

### 11. Optional: test the API directly

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"web:test","message":"Summarize the projects in memory"}'
```

### 12. Optional: try a voice workflow

If `OPENAI_API_KEY` and `ffmpeg` are configured:

1. Send a Telegram voice message
2. Confirm it is transcribed correctly

If `ELEVEN_LABS_API_KEY` is also configured, ask for a spoken reply.

## First-Run Checklist

- `npm install` completed without errors
- `.env.local` exists
- Claude auth is available
- `OPENAI_API_KEY` is set if you want memory indexing and Whisper
- `memory/*.qmd` has your own starter context
- `npm run dev` starts successfully
- `http://localhost:3000` loads
- Telegram responds if enabled

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

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

Memory files live in `profile/memory/*.qmd`. The repo ships `memory/*.example.qmd` templates — `npm run setup` copies them into your profile and personalizes them.

The app indexes them into `data/memory-index.sqlite` using SQLite FTS and optional OpenAI embeddings. Relevant memories are automatically retrieved into the prompt.

### Projects and tasks

Projects are self-contained directories under `projects/`. The project board (`data/projects.json`) is a lightweight index that stores only metadata — a brief description, status, location, and part references. All detailed context and tasks live inside each project's own directory.

**Project creation flow:**

When you ask the agent to create a project, it:

1. Asks clarifying questions (purpose, tech stack, components, constraints)
2. Creates a board entry with a brief one-line description
3. Scaffolds `projects/<id>/` with a detailed `CLAUDE.md` based on your answers

**Project directory structure:**

```
projects/erp/
├── CLAUDE.md              ← project overview, tech stack, conventions, architecture
├── tasks.json             ← all tasks for this project
├── backend/
│   └── CLAUDE.md          ← backend-specific context
└── docs/
    └── CLAUDE.md          ← docs conventions
```

**What's always loaded** (every message):

The board index shows each active project as a one-liner with task counts. No detailed context is loaded unless the project is mentioned.

**What's loaded on mention:**

`CLAUDE.md` files from the project and its parts are injected into context only when your message references the project by name, ID, or part name.

**What the agent can do:**

- Create or update projects (with `description` for the board summary)
- Add or remove parts (sub-components with their own `CLAUDE.md`)
- Add, update, or delete tasks (stored in `projects/<id>/tasks.json`)
- Autonomously update `CLAUDE.md` when you share relevant project context

**Parts** let a project have multiple sub-components — a backend repo, a marketing site, a knowledge base, etc. Each part has a name, type, and location (filesystem path or URL). Parts with filesystem locations get their own directory and `CLAUDE.md` scaffolded automatically.

### Cron jobs

The agent can create scheduled jobs that run prompts through the agent on a cron schedule.

Example use cases:

- Daily summaries
- Weekly planning
- Inbox triage
- Recurring reminders

### Skills

Skills are Markdown instruction bundles. Each skill is a directory containing a `SKILL.md` file with YAML frontmatter and a body describing what the agent should do.

The agent can discover available skills and load one on demand using the built-in `load_skill` tool.

Skills are loaded from two locations (user-added overrides pre-installed):

| Location | Purpose |
|---|---|
| `src/agent/skills/bundled/` | Pre-installed — ships with the repo |
| `profile/skills/` | User-added — gitignored, lives in your profile repo |

The pre-installed skills include Google Workspace workflows (Gmail, Calendar, Drive, Docs, Sheets, Tasks), browser automation, and voice reply. Add your own skills to `profile/skills/` — they override pre-installed skills of the same name.

## Quick Start

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/byte-ai-assistant/lightweight-agent.git
cd lightweight-agent
npm install
```

2. Run the interactive setup:

```bash
npm run setup
```

This walks you through API keys, Telegram, Google Workspace, voice, and your initial agent context (name, goals, key people, projects). It writes `.env.local` and `memory/*.qmd` for you.

3. Start the app:

```bash
npm run dev
```

4. Open:

- Web UI: `http://localhost:3000`
- Chat API: `POST /api/chat`

You can also set things up manually — see the step-by-step guide below.

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

Important:

- If you already use Claude Code on this machine and it is logged in, you may not need to set `ANTHROPIC_API_KEY`.
- In that case, the Claude Agent SDK can often use your existing local Claude authentication automatically.
- That is why this app may run even if `.env.local` does not contain an Anthropic key.

In plain terms:

- already using Claude Code and it works on this machine: you can usually try running this repo without `ANTHROPIC_API_KEY`
- not using Claude Code, or unsure whether Claude auth is available: set `ANTHROPIC_API_KEY` manually

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

If you are already logged into Claude Code and want to try the repo without setting an Anthropic key, continue to the next steps and start the app.

If the app starts and responds to chat requests, your existing Claude authentication is being reused successfully.

If startup or chat requests fail with a Claude or Anthropic authentication error, add `ANTHROPIC_API_KEY` to `.env.local` and restart.

### 4. Create your local env file

```bash
cp .env.example .env.local
```

Copy-paste starter file if you are already using Claude Code locally:

```bash
cat > .env.local <<'EOF'
PORT=3000
OPENAI_API_KEY=replace_me
EOF
```

Copy-paste starter file if you are not already authenticated with Claude tools on your machine:

```bash
cat > .env.local <<'EOF'
PORT=3000
ANTHROPIC_API_KEY=replace_me
OPENAI_API_KEY=replace_me
EOF
```

Then open `.env.local` and replace the placeholder values.

Minimum useful setup:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
```

If you are already using Claude Code locally, a minimal `.env.local` often looks like:

```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
```

If you are not already authenticated with Claude tools on your machine, use:

```env
PORT=3000
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key
```

Recommended additions if you want Telegram:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ALLOWED_USERS=123456789
```

Recommended additions if you want the agent to have its own explicit Google Workspace identity:

```env
AGENT_EMAIL=agent@example.com
GWS_CREDENTIALS_FILE=/absolute/path/to/gws-credentials.json
```

Recommended additions if you want voice replies:

```env
ELEVEN_LABS_API_KEY=your_elevenlabs_key
ELEVEN_LABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

### 4a. Detailed Telegram setup

If you want to use the Telegram bot, do this from start to finish.

#### Create the bot with BotFather

1. Open Telegram.
2. Search for `@BotFather`.
3. Start a chat with BotFather.
4. Send:

```text
/newbot
```

5. Follow the prompts:

- choose a display name for the bot
- choose a unique username ending in `bot`

Example:

- Display name: `My Lightweight Agent`
- Username: `my_lightweight_agent_bot`

6. BotFather will reply with a bot token that looks like this:

```text
123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789
```

That token is your `TELEGRAM_BOT_TOKEN`.

#### Put the bot token in `.env.local`

Open `.env.local` and add:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789
```

#### Find your Telegram user ID

This project restricts access using `TELEGRAM_ALLOWED_USERS`.

You need your numeric Telegram user ID, not your username.

One easy way:

1. In Telegram, search for `@userinfobot`
2. Start a chat with it
3. It will reply with your numeric Telegram ID

Example:

```text
Id: 123456789
```

#### Add your user ID to `.env.local`

If your Telegram ID is `123456789`, add:

```env
TELEGRAM_ALLOWED_USERS=123456789
```

If you want to allow multiple users, separate them with commas:

```env
TELEGRAM_ALLOWED_USERS=123456789,987654321
```

#### Start the app and verify Telegram is enabled

Run:

```bash
npm run dev
```

When Telegram is configured correctly, you should see:

```text
Telegram bot started (polling)
```

and also:

```text
Telegram: Active (polling)
```

#### Start a chat with your bot

1. In Telegram, search for the bot username you created in BotFather
2. Open the bot chat
3. Press `Start` or send a message like:

```text
hello
```

If your user ID is in `TELEGRAM_ALLOWED_USERS`, the bot should respond.

#### Common Telegram mistakes

- You used your Telegram username instead of your numeric user ID
- The bot token in `.env.local` is wrong
- You forgot to restart the app after editing `.env.local`
- You created the bot but never opened a chat with it
- You enabled Telegram in `.env.local` but the server logs do not show polling started

#### Minimal copy-paste Telegram example

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789
TELEGRAM_ALLOWED_USERS=123456789
```

### 5. Optional: install `ffmpeg`

`ffmpeg` is needed for:

- Telegram voice/audio transcription
- ElevenLabs voice reply conversion

On macOS with Homebrew:

```bash
brew install ffmpeg
/opt/homebrew/bin/ffmpeg -version
```

Important:

- `src/lib/elevenlabs.ts` currently expects `ffmpeg` at `/opt/homebrew/bin/ffmpeg`
- if your `ffmpeg` binary is elsewhere, update that path

### 6. Optional: install and authenticate `gws`

If you want Gmail, Calendar, Drive, Docs, Sheets, Tasks, or Contacts tools:

```bash
brew install googleworkspace-cli
gws --version
gws auth login
```

Then confirm the binary path matches what this repo expects:

```bash
which gws
```

Important:

- the default binary path is `/opt/homebrew/bin/gws` — set `GWS_BINARY` if yours is elsewhere
- to pin the agent to a specific Google account, set `AGENT_EMAIL` and optionally `GWS_CREDENTIALS_FILE`
- see the [Google Workspace](#google-workspace) section below for full identity verification details

### 7. Customize the starter memory

If you ran `npm run setup`, your memory files are already in `profile/memory/`. You can skip this step.

If you prefer to set up memory manually:

```bash
mkdir -p profile/memory
for f in memory/*.example.qmd; do cp "$f" "profile/memory/$(basename ${f%.example.qmd}.qmd)"; done
```

Then edit:

- `profile/memory/base-context.qmd` — agent identity, your name, role, timezone, standing rules
- `profile/memory/goals.qmd` — current goals and priorities
- `profile/memory/people.qmd` — key people the agent should know about
- `profile/memory/projects.qmd` — active projects
- `profile/memory/decisions.qmd` — durable decisions and workflow rules

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

Open it directly:

```bash
open http://localhost:3000
```

Send a simple message like:

- `What tools do you have?`
- `Create a project called Personal OS and add three tasks`
- `What do you know about my goals?`

### 10. Optional: test the Telegram bot

If Telegram is configured:

1. Open your bot in Telegram
2. Send a text message like `hello`
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
- `profile/memory/*.qmd` files exist (run `npm run setup` or copy from templates)
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
- `AGENT_EMAIL`
- `GWS_BINARY`
- `GWS_CREDENTIALS_FILE`
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
2. Run `gws auth login` to authenticate the Google account you want the agent to use
3. Confirm the binary path matches what the repo expects (default `/opt/homebrew/bin/gws`)

#### Without explicit identity (default)

If `AGENT_EMAIL` is not set, the agent uses whatever Google account `gws` is currently authenticated as. This is the simplest setup and works well for single-user environments.

#### With explicit identity

If you want the agent to have a fixed Google Workspace identity, set `AGENT_EMAIL`:

```env
AGENT_EMAIL=agent@example.com
```

When `AGENT_EMAIL` is set:

- At startup, the server calls `gws gmail users getProfile` and verifies the active account matches `AGENT_EMAIL`. If it doesn't match, the server refuses to start.
- Before every Google tool call (Gmail, Calendar, Drive, Docs, Sheets, Tasks, Contacts), the identity is re-verified. The result is cached for 5 minutes, so this doesn't add latency to every request.
- If the credentials rotate or get swapped mid-run, the next tool call will fail with a clear identity mismatch error rather than silently operating as the wrong account.
- The agent's email address is included in the system prompt so it knows its own identity when composing emails.

Note: the identity check uses the Gmail API (`gmail.users.getProfile`), so the Gmail API must be enabled for the authenticated account even if you only plan to use Calendar, Drive, or other services.

#### Dedicated credentials file

If you keep separate `gws` credentials for the agent (e.g. for CI or a service account), point to them with `GWS_CREDENTIALS_FILE`:

```env
AGENT_EMAIL=agent@example.com
GWS_CREDENTIALS_FILE=/absolute/path/to/gws-credentials.json
```

This sets `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` in the environment for all `gws` calls.

#### Custom binary path

If `gws` is not at `/opt/homebrew/bin/gws`, set `GWS_BINARY`:

```env
GWS_BINARY=/usr/local/bin/gws
```

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

## Profile

All your personal customizations live in `profile/` — a single directory that is gitignored from this repo and can be its own git repo.

```
profile/
├── .gitignore        ← excludes ephemeral files
├── memory/           ← your memory files (*.qmd)
├── skills/           ← your custom skills
└── data/
    ├── cron-jobs.json
    └── projects.json
```

This separation means:

- **Cloning the repo** gives you the core bot with no personal data
- **Your profile** is portable — back it up, push it to a private repo, clone it onto another machine
- **Secrets** stay in `.env.local` (never in the profile)

### Setting up your profile

Run the interactive setup — it creates `profile/`, copies memory templates, and offers to `git init` it:

```bash
npm run setup
```

Or initialize manually:

```bash
mkdir -p profile/memory profile/skills profile/data
for f in memory/*.example.qmd; do cp "$f" "profile/memory/${f#memory/}"; done
# rename: remove .example
for f in profile/memory/*.example.qmd; do mv "$f" "${f%.example.qmd}.qmd"; done
```

### Migrating your profile to another machine

```bash
# On the new machine, clone the core bot
git clone <this-repo> lightweight-agent
cd lightweight-agent
npm install

# Clone your profile into the profile/ directory
git clone <your-profile-repo> profile

# Add your secrets
cp .env.example .env.local
# edit .env.local

npm run dev
```

## Repo Layout

```
src/
├── server.ts                  ← server bootstrap
├── paths.ts                   ← all resolved file paths (reads from profile/)
├── agent/
│   ├── index.ts               ← main agent runtime
│   ├── memory/                ← memory indexing and retrieval
│   ├── tools/                 ← tool implementations
│   ├── skills/
│   │   ├── bundled/           ← default skills (shipped with repo)
│   │   └── loader.ts          ← loads bundled → profile/skills/
│   └── consolidation.ts       ← session → memory summarization
├── telegram/bot.ts            ← Telegram bot
└── app/                       ← Next.js UI and API route

memory/*.example.qmd           ← starter templates (committed)
profile/                       ← your personal data (gitignored)
data/                          ← ephemeral runtime state (gitignored)
```

## Making It Your Own

- Edit `profile/memory/*.qmd` to give the agent context about you and your work
- Add skills to `profile/skills/` or contribute generic ones to `src/agent/skills/bundled/`
- Extend tool implementations in `src/agent/tools/`
- Modify the system prompt in `src/agent/index.ts`

## Security Notes

- Do not commit `.env.local`
- Do not commit `data/`
- Do not expose this app publicly without adding authentication
- The agent has broad local tool access and should run only in an environment you trust
- Set `AGENT_EMAIL` if multiple Google accounts are available on the machine, to prevent the agent from accidentally operating as the wrong identity

## Suggested Next Steps

- Run `npm run setup` to create your profile and personalize memory files
- Add skills to `profile/skills/` for your own workflows
- Add or remove tools based on your needs
- Add auth before exposing the web UI
- Point the Google and `ffmpeg` paths to your own environment if needed

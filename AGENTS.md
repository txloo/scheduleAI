# Schedule AI — Agent Instructions

## Two Codebases

- **Root** (`src/`): React 19 + TypeScript + Vite + Tailwind CSS frontend
- **`functions/`**: Firebase Cloud Functions (Node.js 24, CommonJS, plain JS — not TypeScript)

Each has its own `package.json`. Install and run commands separately.

## Build & Verify

- **Frontend build**: `npm run build` (runs `tsc -b && vite build`, outputs to `dist/`)
- **Functions lint**: `npm run lint` (in `functions/` dir — runs before `firebase deploy`)
- **No frontend tests**: No test script or framework configured in root
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters` enforced
- **NEVER run verification (lint/build/tests) on your own**, even if it seems like good practice. The verification is not useful and, if there is an error, it usually sends you into a stuck loop. Only run it if the user explicitly asks. The user will report issues themselves.

## Firebase Emulators (Local Dev)

Ports: Auth 9099 · Functions 5001 · Firestore 8080 · Hosting 5000 · Database 9000

Start: `npm run emulators` (imports `emulator-data` on start; run `npm run emulators:export` in a separate terminal for periodic saves)

## Environment Variables

- Root `.env`: Vite Firebase config (`VITE_FIREBASE_*` keys)
- `functions/.env`: `TELEGRAM_BOT_TOKEN`, `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_TOOLS` (per-user model override via `/model-<model-id>` chat command)
- See `.env.example` files in each location

## Architecture Notes

- **LLM integration**: ChatPanel and Telegram commands use the configured LLM (OpenRouter, model from `LLM_MODEL`, overridable per user via `/model-<model-id>`) with 14 tool-calling tools (CRUD for goals, targets, events + list/create notes). Provider calls are isolated in `functions/openrouter.js`. Tool calling has two modes (`LLM_TOOLS=native|text`, user-set, default native): `native` sends the registered-API `tools` param; `text` is a provider workaround for models without native tool support (OpenRouter `:free`) — it omits the `tools` param, appends a fenced-JSON tool-call protocol to the system prompt at request time only, and parses/executes backend-side. The base prompts are provider-agnostic.
- **RTDB prompt templates**: Telegram and chat `/plan` / `/tplan` commands fetch configurable `systemPrompt` + `userTemplate` from `prompts/{command}` in Realtime Database
- **Firestore collections**: `users/{uid}/events`, `users/{uid}/targets`, `users/{uid}/goals`, `users/{uid}/notes`, `archives`, `telegramUsers`
- **Telegram linking**: `/link <email>` creates a `pending` request; the web app must approve it (sets `uid`) before Telegram commands work
- **Deployment region**: `asia-southeast1`
- **Hosting**: SPA rewrite — all routes → `/index.html`

## Firebase Skills

Available in `.agents/skills/` — use the skill tool to load when working with Firebase services (Firestore rules, Auth, Hosting, etc.)

## Timeline

`timeline.md` tracks completed and pending project milestones.

- **To append**: read last line, add new line with `YYYY-MM-DD ✅/❌ Feature`
- **To find incomplete items**: grep for `❌` only when explicitly asked
- **Do not read the full file** unless specifically needed

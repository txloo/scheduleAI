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

## Firebase Emulators (Local Dev)

Ports: Auth 9099 · Functions 5001 · Firestore 8080 · Hosting 5000 · Database 9000

Start: `npx firebase emulators:start` (or `npx -y firebase-tools@latest emulators:start`)

## Environment Variables

- Root `.env`: Vite Firebase config (`VITE_FIREBASE_*` keys)
- `functions/.env`: `TELEGRAM_BOT_TOKEN`, `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`
- See `.env.example` files in each location

## Architecture Notes

- **Scheduler**: Rule-based (not LLM) — allocates goal time into 09:00–18:00 Mon–Sun slots between events
- **LLM integration**: Telegram `/plan` and ChatPanel use OpenCode Zen API (`big-pickle` model) with tool calling (createMainGoal, createWeeklyGoal, generateSchedule)
- **Firestore collections**: `events`, `goals`, `mainGoals`, `plans`, `telegramUsers`
- **Deployment region**: `asia-southeast1`
- **Hosting**: SPA rewrite — all routes → `/index.html`

## Firebase Skills

Available in `.agents/skills/` — use the skill tool to load when working with Firebase services (Firestore rules, Auth, Hosting, etc.)

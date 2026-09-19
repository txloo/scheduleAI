# Schedule AI — Project Context

## Project Purpose

**Schedule AI** is a web-based weekly planning application that helps users organize their week by managing calendar events and targets. It includes an AI chat assistant with tool-calling capabilities and a Telegram bot that uses configurable prompt templates stored in Realtime Database.

---

## Key Features

### 1. Authentication
- **Google Sign-In** via Firebase Authentication (popup)
- **Email/Password Sign-In** with form validation and error handling
- Auth state persisted across sessions
- Conditional UI: unauthenticated users see the Auth page, authenticated users see the Dashboard

### 2. Week Navigation
- **WeekPicker** component lets users browse weeks (prev/next/today)
- Displays current week range (e.g. "Jul 6 – Jul 12, 2026")
- All data (events, targets) is scoped to the selected week
- **WeekOverview** popup (floating button next to chat) shows this week's targets (current + recurring, plus stale targets flagged "past week"), each with its week, and today's events within the next 3 hours

### 3. Events Management
- **EventList** component for CRUD operations on calendar events
- Fields: title, date, start time, end time
- Events are stored in Firestore (`users/{uid}/events` subcollection)
- Sorted by date then time, **grouped by day** with weekday labels
- Events for the selected week are fetched and displayed
- Add and delete via Modal dialogs with confirmation

### 4. Targets Management
- **TargetList** component for CRUD operations on weekly targets
- Fields: text description, priority (1–5), estimated hours, weekOf (ISO Monday date)
- Targets are stored in Firestore (`users/{uid}/targets` subcollection)
- Targets can optionally be linked to a Main Goal via `mainGoalId`
- Linked main goal title displayed as `→ Main Goal Title`
- Sorted by priority (highest first), then `weekOf` within the same priority
- Organized into **Current**, **Upcoming**, and **Recurring** sections
- Inline status dropdown for quick status changes
- Add, edit, and delete via Modal dialogs with confirmation

### 5. Main Goals Management
- **MainGoalList** component for full CRUD operations on long-term main goals
- Fields: title, description, target date, status (not_started / in_progress / done)
- Main goals are stored in Firestore (`users/{uid}/goals` subcollection)
- Horizontal scrolling card layout with color-coded status badges (red/amber/green)
- Clickable status badge cycles status (with ref-based optimistic updates and debounced saves)
- Sorted by status rank then creation date (oldest first)
- Add, edit, and delete via Modal dialogs with confirmation

### 6. Notes
- **Notes** view (reached via header link or mobile back button) for quick text capture
- Notes are stored in Firestore (`users/{uid}/notes` subcollection) with auto-incremented numeric IDs (tracked in a `_meta` document via transactions)
- **Click-to-copy** note body, **delete with confirmation** modal
- Flex-wrap grid layout (2 cols mobile, 3 cols desktop)
- LLM can **list** and **create** notes via tools (`listNotes`, `createNote`); no update/delete tools

### 7. Today's Events
- **TodayEvents** section at the top of the dashboard (read-only)
- Displays today's events sorted by start time
- **"Archive Day"** button archives today's events to `archives` and removes them (with confirmation modal)

### 8. AI Chat Assistant
- **ChatPanel** component provides a floating AI chat interface (fixed bottom-center toggle button + overlay)
- Chat is **driven by a live RTDB listener**: the client subscribes to `chats/{userId}` and renders entirely from the server's `streaming` writes — no waiting on the HTTP response
- Sends via the `chatWithLLM` Cloud Function (fire-and-forget; the function itself persists to RTDB as it works)
- **Streaming updates**: server writes `streaming: true` on start and after each tool-loop round (progressive user + step bubbles), and `streaming: false` on the final write (or an error bubble on failure) — client loading state follows that flag
- Header button is contextual: **Test Connection** when chat is empty (only the welcome message), **⏹ Unblock** once populated (writes `{streaming: false}` to RTDB to clear a stuck run and re-enable input)
- LLM (OpenRouter, model from `LLM_MODEL`, overridable per user) has tool-calling capabilities (**14 tools**: CRUD for goals, targets, events + list/create for notes)
- Prompts assume the user has **16 active hours/day (07:00–23:00)** with sleep roughly 23:00–07:00 (±1h); they schedule only within active hours and avoid heavy-week overload warnings
- Tool call steps displayed in chat as assistant bubbles — each LLM round in the tool-calling loop (content + tool calls executed) is saved to history as its own message
- Tool outputs (with IDs) prepended to replies for conversation history context
- Sliding window: keeps welcome message + last 50 messages
- `/clear` command resets chat history (handled server-side)
- `/help` command shows all commands (handled client-side); command chips shown on first open
- **Click-to-copy** bubbles with "Copied!" indicator; **newest-to-oldest feed** (latest at top, oldest pushed down) with autoscroll-to-top that stops when the user scrolls down; ↑ float button jumps back to the newest message; up/down arrow history navigation
- `onToolAction` callback refreshes goals, targets, events, and notes lists after AI tool calls

### 9. Telegram Bot Integration
- `/link <email>` — Stores a **pending** link request; user approves in the web app, which sets `uid` on the `telegramUsers` doc
- `/today` — Show today's date
- `/week` — Show current week date range (e.g., "Jul 14 – Jul 20, 2026")
- `/current` / `/upcoming` / `/recurring` — Show targets filtered by status
- `/goals` — Show user's current main goals (non-done)
- `/targets` — Show user's current/recurring targets
- `/events` — Show this week's events
- `/tplan` — Generate new targets for the week using RTDB `prompts/tplan` template
- `/plan` — Fetches prompt template from RTDB `prompts/plan`, fills with user's current targets/events, sends to LLM
- `/archive` — Archive current targets, past events, and completed goals to `archives` collection
- `/start` — Help and welcome message; `/clear` — Reset chat history
- All non-specific commands delegate to the shared `processMessage` core (same history handling as web chat)
- "🤔 Thinking..." indicator sent before processing, reply as second message; long replies split at 4096 chars
- Prompt templates are configurable skills stored in RTDB with `systemPrompt` and `userTemplate` fields

---

## Firebase Services Used

| Service | Usage |
|---------|-------|
| **Authentication** | Google Sign-In + Email/Password providers, auth state management |
| **Cloud Firestore** | Data storage: `users/{uid}/events`, `users/{uid}/targets`, `users/{uid}/goals`, `users/{uid}/notes` subcollections + `archives` + `telegramUsers` top-level |
| **Realtime Database** | Chat message persistence at `chats/{userId}` (web) and `chats/telegram/{uid}` (Telegram), prompt templates at `prompts/{command}` |
| **Cloud Functions** | `chatWithLLM` (callable), `testConnection` (callable), `telegramWebhook` (HTTP), `debugGetPromptTemplate` (HTTP, emulator only) |
| **Firebase Hosting** | SPA hosting of the Vite build output (`dist/`) |
| **Firebase Emulators** | Local dev: Auth (9099), Functions (5001), Firestore (8080), Hosting (5000), Database (9000) |

---

## Build Tooling

| Tool | Purpose |
|------|---------|
| **Vite** | Frontend build tool & dev server (ESM, HMR) |
| **React 19** | UI framework |
| **TypeScript** | Type safety for frontend code (strict mode) |
| **Tailwind CSS** | Utility-first CSS framework |
| **PostCSS** | CSS transformation pipeline |
| **Autoprefixer** | Vendor prefix handling |
| **ESLint** | Cloud Functions code linting (Google style) |
| **Firebase CLI** | Local emulation & deployment |

---

## Project Configuration Summary

- **Project ID**: `scheduleai-df477`
- **Deployment Region**: `asia-southeast1`
- **Cloud Functions Runtime**: Node.js 24
- **Frontend Port (dev)**: Vite default (5173)
- **Emulator Ports**: Auth (9099), Functions (5001), Firestore (8080), Hosting (5000), Database (9000)
- **Hosting**: SPA rewrite (all routes → `/index.html`)
- **Security**: userId-scoped Firestore rules (each user accesses only their own documents)
- **Build Output**: `dist/` directory
- **Two Codebases**: Root (`src/`) for frontend, `functions/` for backend — each has its own `package.json`

---

## Data Model Summary

All user data is stored in per-user subcollections under `users/{uid}/`. Ownership is implicit in the path — no `userId` field is needed in individual documents.

```
users/{uid}/
  events/{docId}        title, date, startTime, endTime, createdAt
  targets/{docId}       text, priority (1-5), estimatedHours, status (current|upcoming|recurring), deadline?, mainGoalId?, weekOf?, createdAt
  goals/{docId}         title, description?, targetDate?, status (not_started|in_progress|done), createdAt
  notes/{numId}         body, createdAt            (numeric ID; _meta doc tracks nextIndex)

archives/{docId}        userId, type (target|event|goal), name, weekStart, weekEnd, goalId?, goalTitle?, archivedAt
telegramUsers/{fromId}  email, chatId, linkedAt, pending?, uid?

chats (RTDB):           chats/{userId} (web) and chats/telegram/{uid} (Telegram) -> { messages[], updatedAt, streaming? } (streaming flags client-side progress on web; Telegram uses a single final write)
prompts (RTDB):         prompts/{command} -> { systemPrompt, userTemplate }
```

---

## Cloud Functions

| Function | Type | Purpose |
|----------|------|---------|
| `testConnection` | Callable | Smoke test for emulator CORS — returns `{ ok: true, timestamp }` |
| `chatWithLLM` | Callable | AI chat with tool calling (14 tools: CRUD for goals/targets/events + list/create notes) |
| `telegramWebhook` | HTTP | Telegram bot webhook: /start, /link, /today, /week, /current, /upcoming, /recurring, /goals, /targets, /events, /plan, /tplan, /archive, /clear |
| `debugGetPromptTemplate` | HTTP | Emulator-only debug endpoint to inspect `prompts/{command}` templates |

### LLM Integration
- **Provider**: OpenRouter (`https://openrouter.ai/api/v1/chat/completions`, isolated in `functions/openrouter.js`)
- **Model**: `z-ai/glm-5.2:free` (via `LLM_MODEL` env; overridable per user with `/model-<model-id>` chat command)
- **Auth**: Bearer token via `LLM_API_KEY` environment variable
- **Tool Calling**: 14 tools defined (CRUD for goals, targets, events + list/create for notes)
- **XML Fallback**: If the model returns tool calls in XML format (`<tool_call>`), they are parsed via `parseXmlToolCalls()` as a fallback
- **Multi-round execution**: LLM returns tool calls → executed in Firestore → results sent back to LLM (up to 5 rounds). Tool outputs (with IDs) are prepended to the final reply for conversation history context.
- **Shared core**: `processMessage(uid, text, {context})` handles history fetch/persist, `/clear`, command expansion, and `/archive` for both web and Telegram contexts
- **Context commands**: `/goals`, `/events`, `/targets`, `/week`, `/current`, `/upcoming`, `/recurring` in chat inject user data as context via `expandCommands()`

---

## Firestore Security Rules

Per-user subcollections (`users/{userId}/events`, `users/{userId}/targets`, `users/{userId}/goals`, `users/{userId}/notes`):
- **Read/Create/Update/Delete**: User can only access their own subcollection (`request.auth.uid == userId`)
- Unauthenticated requests are rejected

Archives (`archives/{docId}`) — top-level, userId-scoped:
- **Read/Update/Delete**: `request.auth.uid == resource.data.userId`
- **Create**: `request.auth.uid == request.resource.data.userId`

telegramUsers (`telegramUsers/{docId}`):
- **List**: any authenticated user (to find pending links by email)
- **Get/Update**: `request.auth.token.email == resource.data.email` (approve/dismiss own pending links)

RTDB rules:
- `chats/$userId` — owner-scoped read/write: `auth.uid === $userId`
- `prompts/` — public read (for Cloud Functions to fetch templates)

---

## Architecture

### Directory Structure

```
schedule_AI/
├── src/                            # Frontend (React 19 + TypeScript + Vite)
│   ├── main.tsx                    # React entry point — renders <App />
│   ├── App.tsx                     # Auth gate + centralized data fetching (goals, events, notes, telegram links)
│   ├── types.ts                    # All TypeScript interfaces
│   ├── index.css                   # Tailwind directives only
│   ├── vite-env.d.ts               # Vite client types
│   ├── lib/
│   │   └── firebase.ts             # Firebase SDK init + auth helpers + emulator connections
│   └── components/
│       ├── Auth.tsx                # Login page (Google + email/password)
│       ├── Dashboard.tsx           # Main layout — orchestrates all child components
│       ├── WeekPicker.tsx          # Week navigation (prev/next/today)
│       ├── TodayEvents.tsx         # Today's events + Archive Day button
│       ├── WeekOverview.tsx        # Floating popup: this week's targets + next 3 hours events
│       ├── EventList.tsx           # Calendar events CRUD, grouped by day (Modal-based forms)
│       ├── TargetList.tsx          # Targets CRUD, Current/Upcoming/Recurring sections (Modal-based forms)
│       ├── MainGoalList.tsx        # Long-term goals CRUD + horizontal card layout (Modal-based forms)
│       ├── Notes.tsx               # Notes view (click-to-copy, delete, flex-wrap grid)
│       ├── ChatPanel.tsx           # AI chat interface with RTDB history + test button
│       ├── Modal.tsx               # Reusable dialog component (Escape/click-outside to close)
│       └── TabbedView.tsx          # UNUSED — leftover from the removed view-mode toggle
├── functions/                      # Backend (Firebase Cloud Functions, Node.js 24)
│   ├── index.js                    # ALL cloud functions (single file, ~1750 lines)
│   ├── openrouter.js               # OpenRouter provider helper (LLM request: URL, headers, timeout)
│   ├── package.json                # Backend deps (firebase-admin, firebase-functions)
│   ├── .env                        # Local secrets (gitignored)
│   ├── .env.example                # Secrets template
│   └── .eslintrc.js                # ESLint config (Google style)
├── scripts/                        # Dev utility scripts
│   └── auto-export.mjs             # Periodic emulator backup (10 min interval)
├── dist/                           # Vite production build output
├── firestore.rules                 # Firestore security rules
├── firestore.indexes.json          # Composite indexes
├── database.rules.json             # RTDB security rules
├── firebase.json                   # Firebase project config + emulator ports
├── .firebaserc                     # Project alias: scheduleai-df477
├── tsconfig.json                   # TypeScript config (strict, ES2020, react-jsx)
├── vite.config.ts                  # Vite config (react plugin, outDir: dist)
├── tailwind.config.js              # Tailwind: scans index.html + src/**/*.{ts,tsx}
├── postcss.config.js               # PostCSS: tailwindcss + autoprefixer
├── package.json                    # Frontend deps (React 19, Firebase 12, Vite 8)
├── index.html                      # SPA shell — <div id="root">
├── AGENTS.md                       # Agent instructions for AI assistants
└── project_context.md              # This file
```

### Two Codebases

The project has two independent codebases, each with its own `package.json`:

| Codebase | Location | Runtime | Module System | Purpose |
|----------|----------|---------|---------------|---------|
| **Frontend** | Root (`src/`) | Browser | ESM (`"type": "module"`) | React SPA |
| **Backend** | `functions/` | Node.js 24 | CommonJS | Cloud Functions |

Install and run commands separately:
- Frontend: `npm install` / `npm run dev` / `npm run build` (in root)
- Backend: `npm install` / `npm run lint` (in `functions/`)

### Component Tree & Data Flow

```
App (auth gate + centralized data fetch)
├── Auth                          # Unauthenticated view
│   ├── Google Sign-In button
│   └── Email/password form
└── Dashboard                     # Authenticated view (receives User)
    ├── Header (title, Notes link, user, sign-out)
    ├── Pending Telegram link banner (Approve / Dismiss)
    ├── <main>
    │   ├── TodayEvents           ──> Firestore "users/{uid}/events" (read + archive today)
    │   ├── MainGoalList          ──> Firestore "users/{uid}/goals" (full CRUD via Modal forms)
    │   ├── WeekPicker            ──> Local state: weekRange
    │   ├── EventList             ──> Firestore "users/{uid}/events" (CRUD via Modal forms)
    │   └── TargetList            ──> Firestore "users/{uid}/targets" (CRUD via Modal forms)
    │                              ──> Firestore "users/{uid}/goals" (read for dropdown)
    ├── Chat toggle button        # Fixed bottom-center, toggles chatbox
    ├── WeekOverview button       # Fixed bottom, next to chat toggle (popup with targets + next 3h events)
    └── ChatPanel (floating)      ──> Cloud Function "chatWithLLM" (text only, fire-and-forget)
       (Unblock / Test            ──> Cloud Function "testConnection"
         Connection btn)              ──> RTDB "chats/{userId}" (live onValue listener; streaming updates drive the UI)
                                       ──> onToolAction callback (refreshes goals/targets/events/notes after AI tool calls)
Notes                             # Separate view (reached via header link / back button)
    └── Notes                     ──> Firestore "users/{uid}/notes" (add/delete, click-to-copy)

Shared components:
└── Modal                         # Reusable dialog (Escape to close, click-outside to close)
                                  # Used by: EventList, TargetList, MainGoalList, Notes for delete confirm
```

**State management**: No global state library. All state is local `useState` in each component. Data is fetched from Firestore via one-time `getDocs` queries (not real-time listeners). `App.tsx` fetches goals, events, notes, and pending Telegram links once and passes them down as props; `Dashboard` derives today/week subsets with `useMemo`.

**No router**: The app is a two-view SPA. `App.tsx` conditionally renders `Auth`, `Dashboard`, or `Notes`; view state persists in `history.pushState` so the browser back button returns to the dashboard.

### Firestore Data Model

All user data lives in per-user subcollections under `users/{uid}/`. This ensures each user can only access their own data via security rules.

```
users/{uid}/
  events/{docId}
    title: string            # e.g. "Team meeting"
    date: string             # ISO date "2026-07-08"
    startTime: string        # "HH:MM" e.g. "09:00"
    endTime: string          # "HH:MM" e.g. "10:00"
    createdAt: Timestamp

  targets/{docId}
    text: string             # Target description
    priority: number         # 1-5 (5 = highest)
    estimatedHours: number   # e.g. 2, 0.5
    status: "current" | "upcoming" | "recurring"
    deadline?: string        # Optional ISO date
    mainGoalId?: string      # Optional link to goals/{docId}
    weekOf?: string          # ISO Monday date for sort order within same priority
    createdAt: Timestamp

  goals/{docId}
    title: string
    description?: string
    targetDate?: string      # ISO date "2026-12-31"
    status: "not_started" | "in_progress" | "done"
    createdAt: Timestamp

  notes/{numId}              # Numeric document ID (1, 2, 3...)
    body: string
    createdAt: Timestamp
  notes/_meta                # nextIndex: number (tracked via transactions)

archives/{docId}              # Top-level, userId-scoped via security rules
    userId: string
    type: "target" | "event" | "goal"
    name: string
    weekStart: number         # Unix timestamp (ms)
    weekEnd: number           # Unix timestamp (ms)
    goalId?: string           # Linked goal ID (for archived targets)
    goalTitle?: string        # Linked goal title (for archived targets)
    archivedAt: Timestamp

telegramUsers/{telegramFromId}  # Telegram user ID as document ID
    email: string              # Linked Firebase email
    chatId: number             # Telegram chat ID for sending messages
    linkedAt: Timestamp
    pending?: boolean          # True while awaiting web-app approval (deleted on approval)
    uid?: string               # Firebase UID — set when the user approves the link in the web app
```

**RTDB structure** (separate from Firestore):
```
chats/
  {userId}              # Web chat history
    messages: Array<{role: string, content: string}>
    updatedAt: number   # Unix timestamp
  telegram/
    {uid}               # Telegram chat history (per user UID)
      messages: Array<{role: string, content: string}>
      updatedAt: number

prompts/
  {command}              # e.g. "plan", "tplan"
    systemPrompt: string # System message for the LLM
    userTemplate: string # User message template with {{placeholders}}
```

### TypeScript Interfaces (`src/types.ts`)

```typescript
interface CalendarEvent { id?, title, date, startTime, endTime, createdAt? }
type MainGoalStatus = "not_started" | "in_progress" | "done"
interface MainGoal { id?, title, description?, targetDate?, status, createdAt? }
type TargetStatus = "current" | "upcoming" | "recurring"
interface Target { id?, text, priority, estimatedHours, status, deadline?, mainGoalId?, weekOf?, createdAt? }
interface WeekRange { start: Date, end: Date, label: string }
type AppView = "dashboard" | "notes"
interface Note { id, body }
```

### Cloud Functions Architecture (`functions/index.js`)

All functions are defined in a single file (~1750 lines). Key patterns:

#### `testConnection` (Callable)
```
Returns { ok: true, timestamp } — smoke test for emulator CORS
```

#### `chatWithLLM` (Callable)
```
Client calls with { text } — the client sends TEXT ONLY, not full history
  → processMessage(uid, text, { context: "web" }):
      → Fetch existing history from RTDB chats/{userId}
      → /clear → reset history to welcome message
      → expandCommands(text) — inline expansion of /plan, /tplan, /goals, /events,
        /targets, /week, /current, /upcoming, /recurring (fetch prompt templates + user data)
      → /archive → handleArchive() (archive + delete current targets, past events, done goals)
      → Send to the configured LLM provider (OpenRouter) with TOOLS + tool_choice: "auto"
      → If LLM returns tool_calls (native API format or XML fallback):
          → Execute each via handleToolCall(toolCall, uid) → writes to users/{uid}/...
          → Send tool results back to LLM for follow-up response
          → Multi-round: up to 5 rounds of tool execution
      → Append user message, each LLM step response (assistant bubble per round), and final reply to history, sliding window (welcome + last 50), persist to RTDB
  → Return { reply, model, systemMessage, steps, messages }
```

#### `telegramWebhook` (HTTP)
```
POST from Telegram Bot API
  → Extract chatId, text, fromId
  → Send "🤔 Thinking..." indicator immediately
  → Route by command:
      /start → Welcome message with all commands
      /link <email> → Store telegramUsers doc with pending: true
      /today → Show today's date
      /week → Show current week date range
      /current | /upcoming | /recurring → Show targets filtered by status
      /goals, /targets, /events, /plan, /tplan, /archive, /clear → delegate to processMessage(uid, text, { context: "telegram" })
  → Send reply via Telegram sendMessage API (long messages split at 4096 chars, Markdown fallback)
  → Always return 200 (Telegram retries on non-200)
```

#### `debugGetPromptTemplate` (HTTP)
```
Emulator-only (rejects non-localhost hosts): GET ?command=plan → returns { command, template }
```

#### LLM Tool Definitions
Fourteen OpenAI-compatible function-calling tools:

| Tool | Parameters | Firestore Write |
|------|-----------|-----------------|
| `createMainGoal` | title, description, targetDate, status | `users/{uid}/goals` collection |
| `createTarget` | text, priority, estimatedHours, status, mainGoalId?, weekOf? | `users/{uid}/targets` collection |
| `createEvent` | title, date, startTime, endTime | `users/{uid}/events` collection |
| `updateMainGoal` | id, title?, description?, targetDate?, status? | `users/{uid}/goals` collection |
| `updateTarget` | id, text?, priority?, estimatedHours?, status?, mainGoalId?, weekOf? | `users/{uid}/targets` collection |
| `updateEvent` | id, title?, date?, startTime?, endTime? | `users/{uid}/events` collection |
| `deleteMainGoal` | id | `users/{uid}/goals` collection |
| `deleteTarget` | id | `users/{uid}/targets` collection |
| `deleteEvent` | id | `users/{uid}/events` collection |
| `listMainGoals` | (none) | read-only |
| `listTargets` | status? | read-only |
| `listEvents` | weekOf?, weekEnd? | read-only |
| `listNotes` | id? | read-only |
| `createNote` | body | `users/{uid}/notes` collection (auto-incremented ID via `_meta`) |

#### Helper Functions
- `processMessage(uid, text, options)` — Shared core for web + Telegram: history, /clear, /model command, command expansion, /archive, LLM call, persistence
- `expandCommands(uid, text)` — Inline expansion of /plan, /tplan, /goals, /events, /targets, /week, /current, /upcoming, /recurring; returns `/archive` as an action
- `handleArchive(uid)` — Archives current targets (skipping those still in their week), past events, and done goals; deletes originals
- `callLLM(apiKey, body)` — LLM provider dispatcher (keyed on `LLM_PROVIDER`, default `openrouter`); add a provider module + `LLM_PROVIDERS` entry to support a new one
- `callLLMWithTools(uid, messages, apiKey, mode, onStep, model)` — Calls the configured LLM provider with tools; multi-round tool execution loop (up to 5 rounds); model defaults to `LLM_MODEL` (per-user override via `/model-<model-id>`)
- `openRouterChat(apiKey, body)` (in `functions/openrouter.js`) — OpenRouter-only request helper (URL, headers, timeout)
- `handleToolCall(toolCall, uid)` — Routes LLM tool calls to Firestore operations (writes to `users/{uid}/` subcollections)
- `parseXmlToolCalls(content)` — Fallback parser for XML-formatted tool calls from the LLM
- `formatToolResult(toolName, result)` — Formats tool outputs with IDs for conversation history context
- `getCurrentWeekMonday()` / `getMondayOf(dateStr)` / `getCurrentWeekSunday()` / `getCurrentDate()` — ISO date helpers
- `getPromptTemplate(command)` — Fetches prompt template from RTDB `prompts/{command}`
- `fetchUserData(uid, weekOf, targetStatus?, weekEnd?)` — Fetches user's targets, events, and goals for template placeholder filling
- `fetchMainGoalsForUser(uid)` — Fetches all goals sorted by status and target date
- `fetchEventsFromToday(uid)` — Fetches events from today onward, sorted by date/time
- `fetchNotesForUser(uid)` — Fetches notes sorted by numeric ID (skips `_meta`)
- `fetchTargetsForUser(uid, targetStatus?)` — Fetches targets filtered by status, sorted by priority
- `fillTemplate(template, vars)` — Replaces `{{key}}` placeholders in template strings
- `formatMainGoal(goal, index)` / `formatEventLine(event, index)` / `formatTargetLine(target, index)` — Display formatters for Telegram and context expansion
- `sendTelegramMessage(chatId, text, token, parseMode)` — Sends Telegram messages, splitting at 4096 chars with Markdown fallback

### Firebase Integration

#### Frontend (`src/lib/firebase.ts`)
Initializes 4 Firebase services with auto-emulator detection:

| Service | Init | Emulator | Port |
|---------|------|----------|------|
| Auth | `getAuth(app)` | `connectAuthEmulator` (with try/catch for HMR) | 9099 |
| Firestore | `getFirestore(app)` | `connectFirestoreEmulator` | 8080 |
| Functions | `getFunctions(app, "asia-southeast1")` | `connectFunctionsEmulator` | 5001 |
| RTDB | `getDatabase(app)` | `connectDatabaseEmulator` | 9000 |

Emulator auto-connects when `window.location.hostname` is `localhost` or `127.0.0.1`.

Exports helper functions: `signInWithGoogle`, `signInWithEmail`, `signOutUser`, `onAuthChange`.

#### Backend (`functions/index.js`)
- Initializes Firebase Admin SDK with `admin.initializeApp()`
- Uses `admin.firestore()` for server-side Firestore access (bypasses security rules)
- Uses `admin.database()` for server-side RTDB access (prompt templates, chat history)
- Secrets managed via `process.env` (`TELEGRAM_BOT_TOKEN`, `LLM_API_KEY`)

### Security Rules

#### Firestore (`firestore.rules`)
```javascript
// Per-user subcollections: users/{userId}/{collection}/{document}
// Authenticated users can only access their own subcollection
allow read: if request.auth != null && request.auth.uid == userId;
allow create: if request.auth != null && request.auth.uid == userId;
allow update, delete: if request.auth != null && request.auth.uid == userId;

// Archives: top-level collection, userId-scoped via resource/request data
allow read, update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;

// telegramUsers: list for any auth user (to find pending links), get/update by own email
allow list: if request.auth != null;
allow get: if request.auth != null && request.auth.token.email == resource.data.email;
allow update: if request.auth != null && request.auth.token.email == resource.data.email;
```

#### RTDB (`database.rules.json`)
```json
"chats": {
  "$userId": {
    ".read": "auth != null && auth.uid === $userId",
    ".write": "auth != null && auth.uid === $userId"
  }
},
"prompts": {
  ".read": true
}
```

### Build & Development

| Command | Location | Purpose |
|---------|----------|---------|
| `npm run dev` | Root | Start Vite dev server |
| `npm run build` | Root | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Root | Preview production build |
| `npm run emulators` | Root | Start emulators with data persistence (imports `emulator-data` on start) |
| `npm run emulators:export` | Root | Periodic emulator export to `emulator-data` (10 min interval, run alongside emulators) |
| `npm run lint` | `functions/` | ESLint for Cloud Functions |
| `firebase deploy` | Root | Deploy all (runs lint predeploy for functions) |

### Environment Variables

**Root `.env`** (Vite, prefixed with `VITE_`):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

**`functions/.env`** (Cloud Functions secrets):
```
TELEGRAM_BOT_TOKEN
LLM_API_KEY
LLM_PROVIDER=openrouter
LLM_MODEL=z-ai/glm-5.2:free
```

Note: Do NOT set `FIREBASE_PROJECT_ID` in `functions/.env` — the `FIREBASE_` prefix is reserved by the emulator and causes the entire `.env` file to fail to load.

### Known Issues & Technical Debt

1. **No real-time listeners** — All Firestore reads use `getDocs` (one-time snapshots). Changes from other tabs/devices won't appear until the user navigates or refreshes. Consider switching to `onSnapshot` for live updates.

2. **Partial optimistic updates** — Most mutations re-fetch the entire collection after write. The exception is the goal status badge, which uses ref-based optimistic statuses with debounced saves.

3. **Telegram link approval requires web app** — `/link` creates a `pending` request; the `uid` is only set after manual approval in the web app. Users without web access can't use Telegram commands.

4. **Single-file Cloud Functions** — All backend logic lives in `functions/index.js` (~1750 lines). Consider splitting into separate files as the codebase grows.

5. **No tests** — Neither the frontend nor backend has test files or testing frameworks configured.

6. **Dead code** — `TabbedView.tsx` is unused since the view-mode toggle was removed (2026-07-24).

7. **Outdated code comments** — `Dashboard.tsx` grid order comments ("Events right", "Targets left") contradict the actual `md:order-*` classes (Events left, Targets right on desktop).

---

## Future Enhancements

1. **Real-time listeners** — Switch from `getDocs` to `onSnapshot` for live updates across tabs/devices
2. **Web app plan generation from templates** — The `/plan` / `/tplan` prompt-template system is now available in both Telegram and web chat; consider a dedicated UI button in ChatPanel
3. **Split Cloud Functions** — Break `functions/index.js` into separate modules (chat, telegram, tools)
4. **Add tests** — Both frontend and backend currently have no test coverage

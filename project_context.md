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

### 3. Events Management
- **EventList** component for CRUD operations on calendar events
- Fields: title, date, start time, end time
- Events are stored in Firestore (`users/{uid}/events` subcollection)
- Sorted by date then time
- Events for the selected week are fetched and displayed
- Add and delete via Modal dialogs with confirmation

### 4. Targets Management
- **TargetList** component for CRUD operations on weekly targets
- Fields: text description, priority (1–5), estimated hours
- Targets are stored in Firestore (`users/{uid}/targets` subcollection)
- Targets can optionally be linked to a Main Goal via `mainGoalId`
- Linked main goal title displayed as `→ Main Goal Title`
- Sorted by priority (highest first)
- Organized into Current and Upcoming sections
- Inline status dropdown for quick status changes
- Add, edit, and delete via Modal dialogs with confirmation

### 5. Main Goals Management
- **MainGoalList** component for full CRUD operations on long-term main goals
- Fields: title, description, target date, status (not_started / in_progress / done)
- Main goals are stored in Firestore (`users/{uid}/goals` subcollection)
- Horizontal scrolling card layout with color-coded status badges (red/amber/green)
- Left border accent based on status
- Add, edit, and delete via Modal dialogs with confirmation

### 6. AI Chat Assistant
- **ChatPanel** component provides an AI chat interface
- Chat history pre-fetched on dashboard mount (loaded before chat opens)
- Calls the `chatWithLLM` Cloud Function via Firebase callable
- LLM (OpenCode Zen, `big-pickle` model) has tool-calling capabilities (12 tools: CRUD for goals, targets, events + list operations)
- Tool call steps displayed in chat as assistant messages
- System prompt displayed in amber-styled UI element
- Tool outputs (with IDs) prepended to replies for conversation history context
- Sliding window: keeps welcome message + last 30 messages
- Chat history persisted to Firebase Realtime Database at `chats/{userId}`
- Auto-scrolls to bottom on new messages (skipped on initial render)
- `/clear` command resets chat history
- "Test Connection" button for verifying emulator connectivity
- `onToolAction` callback refreshes goals, targets, and events lists after AI tool calls

### 7. Telegram Bot Integration
- `/link <email>` — Link Telegram chat to Firebase user
- `/plan` — Fetches prompt template from RTDB `prompts/plan`, fills with user's current targets/events, sends to LLM
- `/tplan` — Generate new targets for the week using RTDB `prompts/tplan` template
- `/goals` — Show user's current main goals (non-done)
- `/targets` — Show user's current/recurring targets
- `/events` — Show this week's events
- `/week` — Show current week date range (e.g., "Jul 14 – Jul 20, 2026")
- `/today` — Show today's date
- `/archive` — Archive current targets, past events, and completed goals to `archives` collection
- `/start` — Help and welcome message
- User mapping stored in `telegramUsers` collection
- Prompt templates are configurable skills stored in RTDB with `systemPrompt` and `userTemplate` fields

---

## Firebase Services Used

| Service | Usage |
|---------|-------|
| **Authentication** | Google Sign-In + Email/Password providers, auth state management |
| **Cloud Firestore** | Data storage: `users/{uid}/events`, `users/{uid}/targets`, `users/{uid}/goals` subcollections + `archives` top-level |
| **Realtime Database** | Chat message persistence at `chats/{userId}`, prompt templates at `prompts/{command}` |
| **Cloud Functions** | `chatWithLLM` (callable), `testConnection` (callable), `telegramWebhook` (HTTP) |
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
  targets/{docId}       text, priority (1-5), estimatedHours, status (current|upcoming|recurring), deadline?, mainGoalId?, createdAt
  goals/{docId}         title, description?, targetDate?, status (not_started|in_progress|done), createdAt

archives/{docId}        userId, type (target|event|goal), name, weekStart, weekEnd, goalId?, goalTitle?, archivedAt
telegramUsers/{fromId}  email, chatId, linkedAt, uid?

chats (RTDB):           chats/{userId} -> { messages[], updatedAt }
prompts (RTDB):         prompts/{command} -> { systemPrompt, userTemplate }
```

---

## Cloud Functions

| Function | Type | Purpose |
|----------|------|---------|
| `testConnection` | Callable | Smoke test for emulator CORS — returns `{ ok: true, timestamp }` |
| `chatWithLLM` | Callable | AI chat with tool calling (12 tools: CRUD for goals, targets, events + list operations) |
| `telegramWebhook` | HTTP | Telegram bot webhook: /start, /link, /plan, /tplan, /goals, /targets, /events, /week, /today, /archive commands |

### LLM Integration
- **Provider**: OpenCode Zen API (`https://opencode.ai/zen/v1/chat/completions`)
- **Model**: `big-pickle`
- **Auth**: Bearer token via `LLM_API_KEY` environment variable
- **Tool Calling**: 12 tools defined (CRUD for goals, targets, events + list operations)
- **XML Fallback**: If the model returns tool calls in XML format (`<tool_call>`), they are parsed via `parseXmlToolCalls()` as a fallback
- **Multi-round execution**: LLM returns tool calls → executed in Firestore → results sent back to LLM (up to 5 rounds). Tool outputs (with IDs) are prepended to the final reply for conversation history context.
- **Context commands**: `/goals`, `/events`, `/targets` in chat inject user data as context via `buildContextPrompt()`

---

## Firestore Security Rules

Per-user subcollections (`users/{userId}/events`, `users/{userId}/targets`, `users/{userId}/goals`):
- **Read/Create/Update/Delete**: User can only access their own subcollection (`request.auth.uid == userId`)
- Unauthenticated requests are rejected

Archives (`archives/{docId}`) — top-level, userId-scoped:
- **Read/Update/Delete**: `request.auth.uid == resource.data.userId`
- **Create**: `request.auth.uid == request.resource.data.userId`

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
│   ├── App.tsx                     # Auth gate — Auth or Dashboard
│   ├── types.ts                    # All TypeScript interfaces
│   ├── index.css                   # Tailwind directives only
│   ├── vite-env.d.ts               # Vite client types
│   ├── lib/
│   │   └── firebase.ts             # Firebase SDK init + auth helpers + emulator connections
│   └── components/
│       ├── Auth.tsx                # Login page (Google + email/password)
│       ├── Dashboard.tsx           # Main layout — orchestrates all child components
│       ├── WeekPicker.tsx          # Week navigation (prev/next/today)
│       ├── EventList.tsx           # Calendar events CRUD (Modal-based forms)
│       ├── TargetList.tsx          # Weekly targets CRUD + main goal linking (Modal-based forms)
│       ├── MainGoalList.tsx        # Long-term goals CRUD + horizontal card layout (Modal-based forms)
│       ├── ChatPanel.tsx           # AI chat interface with RTDB persistence + test button
│       └── Modal.tsx               # Reusable dialog component (Escape/click-outside to close)
├── functions/                      # Backend (Firebase Cloud Functions, Node.js 24)
│   ├── index.js                    # ALL cloud functions (single file, ~1334 lines)
│   ├── package.json                # Backend deps (firebase-admin, firebase-functions)
│   ├── .env                        # Local secrets (gitignored)
│   ├── .env.example                # Secrets template
│   └── .eslintrc.js                # ESLint config (Google style)
├── scripts/                        # Dev utility scripts
│   ├── prepare-emulators.mjs       # Renames firebase-export → emulator-data before start
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
App (auth gate)
├── Auth                          # Unauthenticated view
│   ├── Google Sign-In button
│   └── Email/password form
└── Dashboard                     # Authenticated view (receives User)
    ├── Header (title, user, sign-out)
    ├── <main>
    │   ├── MainGoalList          ──> Firestore "users/{uid}/goals" (full CRUD via Modal forms)
    │   ├── WeekPicker            ──> Local state: weekRange
    │   ├── EventList             ──> Firestore "users/{uid}/events" (CRUD via Modal forms)
    │   └── TargetList            ──> Firestore "users/{uid}/targets" (CRUD via Modal forms)
    │                              ──> Firestore "users/{uid}/goals" (read for dropdown)
    ├── Chat toggle button        # Fixed bottom-center, toggles chatbox
    └── ChatPanel (floating)      ──> Cloud Function "chatWithLLM"
       (Test Connection btn)         ──> Cloud Function "testConnection"
                                      ──> RTDB "chats/{userId}" (load + persist)
                                      ──> onToolAction callback (refreshes goals/targets/events after AI tool calls)

Shared components:
└── Modal                         # Reusable dialog (Escape to close, click-outside to close)
                                  # Used by: EventList, TargetList, MainGoalList for add/edit/delete forms
```

**State management**: No global state library. All state is local `useState` in each component. Data is fetched from Firestore via one-time `getDocs` queries (not real-time listeners). Props flow from `Dashboard` down: `userId` and `weekOf` are passed to all children.

**No router**: The app is a single-view SPA. `App.tsx` conditionally renders `Auth` or `Dashboard` based on Firebase auth state.

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
    createdAt: Timestamp

  goals/{docId}
    title: string
    description?: string
    targetDate?: string      # ISO date "2026-12-31"
    status: "not_started" | "in_progress" | "done"
    createdAt: Timestamp

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
    uid?: string               # Firebase UID (not yet populated — see known issues)
```

**RTDB structure** (separate from Firestore):
```
chats/
  {userId}
    messages: Array<{role: string, content: string}>
    updatedAt: number        # Unix timestamp

prompts/
  {command}                  # e.g. "plan", "tplan"
    systemPrompt: string     # System message for the LLM
    userTemplate: string     # User message template with {{placeholders}}
```

### TypeScript Interfaces (`src/types.ts`)

```typescript
interface CalendarEvent { id?, userId, title, date, startTime, endTime, createdAt? }
type MainGoalStatus = "not_started" | "in_progress" | "done"
interface MainGoal { id?, userId, title, description?, targetDate?, status, createdAt? }
interface Target { id?, userId, text, priority, estimatedHours, status, deadline?, mainGoalId?, createdAt? }
interface WeekRange { start: Date, end: Date, label: string }
```

### Cloud Functions Architecture (`functions/index.js`)

All functions are defined in a single file (~1125 lines). Key patterns:

#### `testConnection` (Callable)
```
Returns { ok: true, timestamp } — smoke test for emulator CORS
```

#### `chatWithLLM` (Callable)
```
Client calls with { messages: Array<{role, content}> }
  → Detect special commands: /plan, /tplan, /goals, /events, /targets
      → If found: fetch prompt template from RTDB, build context prompt with user data
  → Send to OpenCode Zen API (big-pickle model) with TOOLS + tool_choice: "auto"
  → If LLM returns tool_calls (native API format or XML fallback):
      → Execute each via handleToolCall(toolCall, uid)
        → Writes to users/{uid}/goals, users/{uid}/targets, users/{uid}/events
      → Send tool results back to LLM for follow-up response
      → Multi-round: up to 5 rounds of tool execution
  → Return { reply, model, systemMessage, steps }
```

#### `telegramWebhook` (HTTP)
```
POST from Telegram Bot API
  → Extract chatId, text, fromId
  → Route by command:
      /start → Welcome message with all commands
      /link <email> → Store in telegramUsers collection
      /today → Show today's date
      /goals → Fetch user's goals, display current (non-done) ones
      /targets → Fetch user's current/recurring targets
      /events → Fetch this week's events
      /week → Show current week date range
      /tplan → Fetch tplan template from RTDB, fill with user data, call LLM
      /plan → Fetch plan template from RTDB, fill with user data, call LLM
      /archive → Archive current targets, past events, completed goals
  → Send reply via Telegram sendMessage API
  → Always return 200 (Telegram retries on non-200)
```

#### LLM Tool Definitions
Twelve OpenAI-compatible function-calling tools:

| Tool | Parameters | Firestore Write |
|------|-----------|-----------------|
| `createMainGoal` | title, description, targetDate, status | `users/{uid}/goals` collection |
| `createTarget` | text, priority, estimatedHours, status, mainGoalId? | `users/{uid}/targets` collection |
| `createEvent` | title, date, startTime, endTime | `users/{uid}/events` collection |
| `updateMainGoal` | id, title?, description?, targetDate?, status? | `users/{uid}/goals` collection |
| `updateTarget` | id, text?, priority?, estimatedHours?, status?, mainGoalId? | `users/{uid}/targets` collection |
| `updateEvent` | id, title?, date?, startTime?, endTime? | `users/{uid}/events` collection |
| `deleteMainGoal` | id | `users/{uid}/goals` collection |
| `deleteTarget` | id | `users/{uid}/targets` collection |
| `deleteEvent` | id | `users/{uid}/events` collection |
| `listMainGoals` | (none) | read-only |
| `listTargets` | status? | read-only |
| `listEvents` | weekOf?, weekEnd? | read-only |

#### Helper Functions
- `handleToolCall(toolCall, uid)` — Routes LLM tool calls to Firestore operations (writes to `users/{uid}/` subcollections)
- `parseXmlToolCalls(content)` — Fallback parser for XML-formatted tool calls from big-pickle model
- `formatToolResult(toolName, result)` — Formats tool outputs with IDs for conversation history context
- `getCurrentWeekMonday()` — Returns ISO date string for current week's Monday
- `getCurrentWeekSunday()` — Returns ISO date string for current week's Sunday
- `getCurrentDate()` — Returns ISO date string for today
- `getPromptTemplate(command)` — Fetches prompt template from RTDB `prompts/{command}`
- `fetchUserData(uid, weekOf, targetStatus?, weekEnd?)` — Fetches user's targets, events, and goals for template placeholder filling
- `fetchMainGoalsForUser(uid)` — Fetches all goals sorted by status and target date
- `fetchEventsForWeek(uid, weekOf, weekEnd?)` — Fetches events bounded by week range
- `fetchTargetsForUser(uid, targetStatus?)` — Fetches targets filtered by status, sorted by priority
- `buildContextPrompt(uid, command, trailingText)` — Builds context prompt for /goals, /events, /targets commands
- `fillTemplate(template, vars)` — Replaces `{{key}}` placeholders in template strings
- `formatMainGoal(goal, index)` — Formats a goal for Telegram display
- `formatEventLine(event, index)` — Formats an event for Telegram display
- `formatTargetLine(target, index)` — Formats a target for Telegram display

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
- Uses `admin.database()` for server-side RTDB access (prompt templates)
- Secrets managed via `defineString()` (Firebase Secrets Manager in production, `process.env` in emulator)

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
LLM_PROVIDER=opencode
LLM_MODEL=big-pickle
```

Note: Do NOT set `FIREBASE_PROJECT_ID` in `functions/.env` — the `FIREBASE_` prefix is reserved by the emulator and causes the entire `.env` file to fail to load.

### Known Issues & Technical Debt

1. **No real-time listeners** — All Firestore reads use `getDocs` (one-time snapshots). Changes from other tabs/devices won't appear until the user navigates or refreshes. Consider switching to `onSnapshot` for live updates.

2. **No optimistic updates** — All mutations re-fetch the entire collection after write. Could be improved with local state updates before server confirmation.

3. **Telegram `/link` doesn't set `uid`** — The `/link` command stores `email` and `chatId` but never populates the `uid` field on the `telegramUsers` document. This means `/plan`, `/tplan`, `/goals`, `/targets`, `/events`, and `/archive` commands return "pending verification" until uid lookup is implemented.

4. **Single-file Cloud Functions** — All backend logic lives in `functions/index.js` (~1334 lines). Consider splitting into separate files as the codebase grows.

5. **No tests** — Neither the frontend nor backend has test files or testing frameworks configured.

---

## Future Enhancements

1. **LLM-powered plan generation in web app** — The `/plan` and `/tplan` prompt template system works in Telegram; extend it to the web ChatPanel
2. **Multi-user Telegram linking** — The `/link` command stores email but doesn't set `uid` on the `telegramUsers` document, so `/plan`, `/tplan`, `/goals`, `/targets`, `/events`, and `/archive` return "pending verification" until uid lookup is implemented
3. **Real-time listeners** — Switch from `getDocs` to `onSnapshot` for live updates across tabs/devices

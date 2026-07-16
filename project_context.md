# Schedule AI — Project Context

## Project Purpose

**Schedule AI** is a web-based weekly planning and scheduling application that helps users organize their week by managing calendar events, setting goals, and generating AI-powered weekly plans. It includes a Telegram bot for interacting with plans via chat and an AI chat assistant with tool-calling capabilities.

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
- All data (events, goals, plans) is scoped to the selected week

### 3. Events Management
- **EventList** component for CRUD operations on calendar events
- Fields: title, date, start time, end time
- Events are stored in Firestore (`events` collection)
- Sorted by date then time
- Events for the selected week are fetched and displayed

### 4. Goals Management
- **GoalList** component for CRUD operations on weekly goals
- Fields: text description, priority (1–5), estimated hours
- Goals are stored in Firestore (`goals` collection)
- Goals can optionally be linked to a Main Goal via `mainGoalId`
- Linked main goal title displayed as `→ Main Goal Title`
- Sorted by priority (highest first)

### 5. Main Goals Management
- **MainGoalList** component for full CRUD operations on long-term main goals
- Fields: title, description, target date, status (not_started / in_progress / done)
- Main goals are stored in Firestore (`mainGoals` collection)
- Inline edit mode with toggle between display and edit views
- Status badges with color coding (red/amber/green)
- Main goals are passed as context to the plan generation scheduler for future LLM-based scheduling

### 6. AI Weekly Plan Generation
- **WeeklyPlan** component orchestrates AI plan generation
- Click "Generate Weekly Plan" to call a Firebase Cloud Function
- Cloud Function fetches events, goals, and main goals from Firestore
- Rule-based scheduler allocates goal time into free slots between events (Mon–Sun, 09:00–18:00, max 3h per slot)
- Plan displayed day-by-day with time slots
- **Accept** button converts plan slots into individual events
- **Regenerate** button re-runs plan generation

### 7. AI Chat Assistant
- **ChatPanel** component provides an AI chat interface
- Calls the `chatWithLLM` Cloud Function via Firebase callable
- LLM (OpenCode Zen, `big-pickle` model) has tool-calling capabilities:
  - `createMainGoal` — creates long-term goals in Firestore
  - `createWeeklyGoal` — creates weekly goals in Firestore
  - `generateSchedule` — generates schedules (rule-based or LLM-powered)
- Sliding window: keeps system prompt + last 20 messages (10 user/assistant pairs)
- Chat history persisted to Firebase Realtime Database at `chats/{userId}`
- Auto-scrolls to bottom on new messages

### 8. Telegram Bot Integration
- `/link <email>` — Link Telegram chat to Firebase user
- `/week` — View this week's plan via Telegram
- `/plan <goals>` — AI-powered plan generation: parses goals via LLM, creates weekly goals in Firestore, generates schedule
- `/start` — Help and welcome message
- User mapping stored in `telegramUsers` collection

---

## Firebase Services Used

| Service | Usage |
|---------|-------|
| **Authentication** | Google Sign-In + Email/Password providers, auth state management |
| **Cloud Firestore** | Data storage: `events`, `goals`, `mainGoals`, `plans`, `telegramUsers` collections |
| **Realtime Database** | Chat message persistence at `chats/{userId}` |
| **Cloud Functions** | `generateWeeklyPlan` (callable), `chatWithLLM` (callable), `telegramWebhook` (HTTP), `helloWorld` (HTTP) |
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

```
events:        userId, title, date, startTime, endTime, createdAt
goals:         userId, text, priority (1-5), estimatedHours, weekOf, deadline?, mainGoalId?, createdAt
mainGoals:     userId, title, description?, targetDate?, status (not_started|in_progress|done), createdAt
plans:         userId, weekOf, generatedAt, accepted (bool), slots[]
telegramUsers: email, chatId, linkedAt, uid?
chats (RTDB):  chats/{userId} -> { messages[], updatedAt }
```

### PlanSlot (nested in plans)
```
{ day, date, startTime, endTime, goalId, goalText }
```

---

## Cloud Functions

| Function | Type | Purpose |
|----------|------|---------|
| `generateWeeklyPlan` | Callable | Rule-based scheduler: fetches events/goals/mainGoals, slots goals into free time |
| `chatWithLLM` | Callable | AI chat with tool calling (createMainGoal, createWeeklyGoal, generateSchedule) |
| `telegramWebhook` | HTTP | Telegram bot webhook: /start, /link, /week, /plan commands |
| `helloWorld` | HTTP | Test/health-check endpoint |

### LLM Integration
- **Provider**: OpenCode Zen API (`https://opencode.ai/zen/v1/chat/completions`)
- **Model**: `big-pickle`
- **Auth**: Bearer token via `LLM_API_KEY` environment variable
- **Tool Calling**: 3 tools defined (createMainGoal, createWeeklyGoal, generateSchedule)
- **Two-phase execution**: LLM returns tool calls → executed in Firestore → results sent back to LLM for natural language summary

---

## Firestore Security Rules

All four main collections (`events`, `goals`, `plans`, `mainGoals`) use userId-scoped access:
- **Read/Update/Delete**: `isOwner(resource.data.userId)` — document's userId must match `request.auth.uid`
- **Create**: `request.auth.uid == request.resource.data.userId` — user can only create documents with their own userId
- Unauthenticated requests are rejected

RTDB rules restrict chat access to the owner: `auth.uid === $userId` at `chats/$userId`.

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
│       ├── EventList.tsx           # Calendar events CRUD
│       ├── GoalList.tsx            # Weekly goals CRUD + main goal linking
│       ├── MainGoalList.tsx        # Long-term goals CRUD + inline editing
│       ├── WeeklyPlan.tsx          # AI plan generation + display + accept
│       └── ChatPanel.tsx           # AI chat interface with RTDB persistence
├── functions/                      # Backend (Firebase Cloud Functions, Node.js 24)
│   ├── index.js                    # ALL cloud functions (single file, ~690 lines)
│   ├── package.json                # Backend deps (firebase-admin, firebase-functions)
│   ├── .env                        # Local secrets (gitignored)
│   ├── .env.example                # Secrets template
│   └── .eslintrc.js                # ESLint config (Google style)
├── dist/                           # Vite production build output
├── .tasks/complete/                # Completed task records (11 tasks)
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
    └── <main>
        ├── MainGoalList          ──> Firestore "mainGoals" (full CRUD)
        ├── WeekPicker            ──> Local state: weekRange
        ├── EventList             ──> Firestore "events" (create + delete)
        ├── GoalList              ──> Firestore "goals" (create + delete)
        │                          ──> Firestore "mainGoals" (read for dropdown)
        ├── WeeklyPlan            ──> Cloud Function "generateWeeklyPlan"
        │                          ──> Firestore "plans" (save generated plan)
        │                          ──> Firestore "events" (on accept: convert slots → events)
        └── ChatPanel             ──> Cloud Function "chatWithLLM"
                                   ──> RTDB "chats/{userId}" (load + persist)
```

**State management**: No global state library. All state is local `useState` in each component. Data is fetched from Firestore via one-time `getDocs` queries (not real-time listeners). Props flow from `Dashboard` down: `userId` and `weekOf` are passed to all children.

**No router**: The app is a single-view SPA. `App.tsx` conditionally renders `Auth` or `Dashboard` based on Firebase auth state.

### Firestore Data Model

```
events/
  {docId}
    userId: string           # Owner's Firebase UID
    title: string            # e.g. "Team meeting"
    date: string             # ISO date "2026-07-08"
    startTime: string        # "HH:MM" e.g. "09:00"
    endTime: string          # "HH:MM" e.g. "10:00"
    createdAt: Timestamp

goals/
  {docId}
    userId: string
    text: string             # Goal description
    priority: number         # 1-5 (5 = highest)
    estimatedHours: number   # e.g. 2, 0.5
    weekOf: string           # ISO Monday date "2026-07-06"
    deadline?: string        # Optional ISO date
    mainGoalId?: string      # Optional link to mainGoals/{docId}
    createdAt: Timestamp

mainGoals/
  {docId}
    userId: string
    title: string
    description?: string
    targetDate?: string      # ISO date "2026-12-31"
    status: "not_started" | "in_progress" | "done"
    createdAt: Timestamp

plans/
  {docId}
    userId: string
    weekOf: string           # ISO Monday date
    generatedAt: Timestamp
    accepted: boolean        # Whether plan was accepted (converted to events)
    slots: PlanSlot[]        # Array of scheduled time blocks

telegramUsers/
  {telegramFromId}           # Telegram user ID as document ID
    email: string            # Linked Firebase email
    chatId: number           # Telegram chat ID for sending messages
    linkedAt: Timestamp
    uid?: string             # Firebase UID (not yet populated — see known issues)
```

**RTDB structure** (separate from Firestore):
```
chats/
  {userId}
    messages: Array<{role: string, content: string}>
    updatedAt: number        # Unix timestamp
```

### TypeScript Interfaces (`src/types.ts`)

```typescript
interface CalendarEvent { id?, userId, title, date, startTime, endTime, createdAt? }
type MainGoalStatus = "not_started" | "in_progress" | "done"
interface MainGoal { id?, userId, title, description?, targetDate?, status, createdAt? }
interface Goal { id?, userId, text, priority, estimatedHours, weekOf, deadline?, mainGoalId?, createdAt? }
interface PlanSlot { day, date, startTime, endTime, goalId, goalText }
interface WeeklyPlan { id?, userId, weekOf, generatedAt?, accepted, slots: PlanSlot[] }
interface WeekRange { start: Date, end: Date, label: string }
```

### Cloud Functions Architecture (`functions/index.js`)

All functions are defined in a single file. Key patterns:

#### `generateWeeklyPlan` (Callable, lines 162-178)
```
Client calls with { weekOf }
  → buildPlan(uid, weekOf)
    → Query Firestore: events (by userId + date range)
    → Query Firestore: goals (by userId + weekOf)
    → Query Firestore: mainGoals (by userId)
    → scheduleGoals(events, goals, weekDays, mainGoals)
      → Sort goals by priority (highest first)
      → For each goal, iterate Mon-Sun
      → Compute free slots between events (09:00-18:00 window)
      → Assign up to 3 hours per free slot
      → Continue until estimatedHours fulfilled
  → Return { slots: PlanSlot[] }
```

#### `chatWithLLM` (Callable, lines 582-690)
```
Client calls with { messages: Array<{role, content}> }
  → Send to OpenCode Zen API (big-pickle model) with TOOLS + tool_choice: "auto"
  → If LLM returns tool_calls:
      → Execute each via handleToolCall(toolCall, uid)
        → createMainGoal → Firestore "mainGoals" write
        → createWeeklyGoal → Firestore "goals" write
        → generateSchedule (rule) → buildPlan() → slots
        → generateSchedule (llm) → return raw data for LLM
      → Send tool results back to LLM for follow-up response
  → Return { reply: string, model: string }
```

#### `telegramWebhook` (HTTP, lines 354-568)
```
POST from Telegram Bot API
  → Extract chatId, text, fromId
  → Route by command:
      /start → Welcome message
      /link <email> → Store in telegramUsers collection
      /week → Lookup user → buildPlan() → Format schedule as markdown
      /plan <goals> → LLM with tools → create goals → generate schedule → summary
  → Send reply via Telegram sendMessage API
  → Always return 200 (Telegram retries on non-200)
```

#### LLM Tool Definitions (lines 182-237)
Three OpenAI-compatible function-calling tools:

| Tool | Parameters | Firestore Write |
|------|-----------|-----------------|
| `createMainGoal` | title, description, targetDate, status | `mainGoals` collection |
| `createWeeklyGoal` | text, priority, estimatedHours, weekOf, mainGoalId? | `goals` collection |
| `generateSchedule` | weekOf, method ("rule" \| "llm") | Read-only (returns slots or data) |

#### Helper Functions
- `getWeekDays(weekOf)` — Returns array of 7 `{day, date}` objects (Mon-Sun)
- `scheduleGoals(events, goals, weekDays, mainGoals)` — Rule-based scheduler
- `buildPlan(uid, weekOf)` — Fetches all user data, runs scheduler
- `handleToolCall(toolCall, uid)` — Routes LLM tool calls to Firestore operations
- `getCurrentWeekMonday()` — Returns ISO date string for current week's Monday

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
- Secrets managed via `defineString()` (Firebase Secrets Manager in production, `process.env` in emulator)

### Security Rules

#### Firestore (`firestore.rules`)
```javascript
function isOwner(userId) {
  return request.auth != null && request.auth.uid == userId;
}

// For events, goals, plans, mainGoals:
allow read, update, delete: if isOwner(resource.data.userId);
allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
```

#### RTDB (`database.rules.json`)
```json
"chats": {
  "$userId": {
    ".read": "auth != null && auth.uid === $userId",
    ".write": "auth != null && auth.uid === $userId"
  }
}
```

### Build & Development

| Command | Location | Purpose |
|---------|----------|---------|
| `npm run dev` | Root | Start Vite dev server |
| `npm run build` | Root | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Root | Preview production build |
| `npm run lint` | `functions/` | ESLint for Cloud Functions |
| `npx firebase emulators:start` | Root | Start all Firebase emulators |
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

### Known Issues & Technical Debt

1. **No real-time listeners** — All Firestore reads use `getDocs` (one-time snapshots). Changes from other tabs/devices won't appear until the user navigates or refreshes. Consider switching to `onSnapshot` for live updates.

2. **No optimistic updates** — All mutations re-fetch the entire collection after write. Could be improved with local state updates before server confirmation.

3. **Telegram `/link` doesn't set `uid`** — The `/link` command stores `email` and `chatId` but never populates the `uid` field on the `telegramUsers` document. This means `/week` and `/plan` commands always return "pending verification" until uid lookup is implemented.

4. **Single-file Cloud Functions** — All backend logic lives in `functions/index.js` (~690 lines). Consider splitting into separate files as the codebase grows.

5. **Rule-based scheduler only** — The `scheduleGoals()` function is deterministic. LLM-powered scheduling is stubbed out with a TODO comment. The tool calling infrastructure (`generateSchedule` with `method: "llm"`) returns raw data but the LLM doesn't yet generate structured schedule output.

6. **No tests** — Neither the frontend nor backend has test files or testing frameworks configured.

---

## Future Enhancements (from code comments)

1. **LLM-powered plan generation** — Replace rule-based scheduler with AI scheduling (tool calling infrastructure exists, scheduler has TODO comment)
2. **Multi-user Telegram linking** — The `/link` command stores email but doesn't set `uid` on the `telegramUsers` document, so `/week` and `/plan` commands return "pending verification" until uid verification is implemented

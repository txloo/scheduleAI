# Schedule AI — Timeline

Project milestones. Each entry: `YYYY-MM-DD ✅/❌ Feature`.

To append: read last line, add new line below. To find incomplete items: grep for `❌` only when asked.

2026-07-19 ✅ Emulator auto-export and import scripts
2026-07-19 ✅ Bug fixes (firestore rules, event query bounds, shared mainGoals state)
2026-07-19 ✅ Simplified emulator persistence (auto-export to emulator-data, removed prepare script)
2026-07-19 ✅ Floating chat UI (centered toggle button + overlay chatbox replacing sidebar)
2026-07-19 ✅ LLM tool call logging with full params, system prompt improvements (batch tool calls, ID-in-response rules, tool output prepended to replies)
2026-07-19 ✅ Telegram /week command (shows current week date range)
2026-07-19 ✅ Chat pre-fetch (loads chat history on dashboard mount, hides initial scroll)

2026-07-20 ✅ Firestore subcollection migration (users/{uid}/{collection}) — events, targets, goals moved from top-level collections to per-user subcollections; mainGoals renamed to goals; documentation updated to match code

2026-07-23 ✅ /archive command in web chat (archiving current targets, past events, completed goals)
2026-07-23 ✅ Chat closes on outside click (backdrop overlay)
2026-07-23 ✅ Double-click goal status cycling with 2s debounce
2026-07-23 ✅ Fix addTarget/saveEdit empty mainGoalId handling
2026-07-23 ✅ Target list split into Current, Recurring, Upcoming sections
2026-07-23 ✅ Event list grouped by day with text-only layout
2026-07-23 ✅ Event list scrollable height matched to target list

2026-07-24 ✅ Today's Events section (read-only, displays today's events with archive button)
2026-07-24 ✅ Single event fetch architecture (Dashboard fetches once, passes filtered subsets to children)
2026-07-24 ✅ New layout: Today's Events → Main Goals → Targets + WeekPicker/Events (side-by-side)
2026-07-24 ✅ View mode toggle with 3 modes (targets-first, events-first, tabbed)
2026-07-24 ✅ URL persistence for view mode (?view=targets-first|events-first|tabbed)
2026-07-24 ✅ Tabbed view with tab switching between Targets and Events
2026-07-24 ✅ Mobile responsive: Targets wraps above WeekPicker+Events on mobile
2026-07-24 ✅ Main Goals wrap to 2-column grid on mobile (no horizontal scroll)
2026-07-24 ✅ Goals sorted by creation date (oldest first)

2026-07-24 ✅ Fix goal sort — Timestamp-aware toMs() helper for Firestore Timestamp objects
2026-07-24 ✅ Chat history navigation (up/down arrows cycle through previous user messages)
2026-07-24 ✅ Chat horizontal scroll fix (overflow-x-hidden on messages area)
2026-07-24 ✅ Target weekOf field — manual ISO Monday date for sort ordering within same priority
2026-07-24 ✅ LLM tool definitions updated for weekOf (createTarget, updateTarget, system prompt)
2026-07-24 ✅ MainGoalList clickable status badge — works on mobile (replaces unreliable onDoubleClick)
2026-07-24 ✅ Goal status rapid-click fix — ref-based optimistic statuses prevent stale state
2026-07-24 ✅ Chat click-to-copy — tap bubble to copy text with "Copied!" indicator
2026-07-24 ✅ weekOf shown in LLM context — /targets and listTargets tool results include Week of date
2026-07-24 ✅ Chat history moved to Cloud Functions — processMessage fetches/persists/clears RTDB history; client sends text only
2026-07-24 ✅ Telegram Thinking indicator — sendMessage("🤔 Thinking...") before command processing, response as second message
2026-07-24 ✅ Telegram history unified via processMessage — context param ("web"/"telegram") routes to correct RTDB path
2026-07-24 ✅ RTDB + Firestore rules hardened — prompts restricted to auth users, telegramUsers list permission added
2026-07-24 ✅ /week expansion — injects events, targets, goals into chat message and saves to history; updated command lists in web chat and Telegram /start
2026-07-24 ✅ Chat fixes — double welcome message fix, scroll-to-bottom button replacing auto-scroll, ID in formatEventLine/formatTargetLine, weekOf snapped to Monday in datepicker and tool calls, Telegram long message splitting

2026-07-26 ✅ Notes — click-to-copy, delete with confirmation, centralized data fetching in App.tsx
2026-07-26 ✅ Notes AI tools — listNotes and createNote in Cloud Functions, system prompt updated
2026-07-26 ✅ Removed view toggle — fixed layout: events left/targets right on desktop, targets above/events below on mobile

2026-07-27 ✅ Notes layout fix — replaced horizontal scroll with flex-wrap grid (2 cols mobile, 3 cols desktop), visible delete button
2026-07-27 ✅ Telegram commands — /week now shows date range only; added /current, /upcoming, /recurring for target filtering
2026-07-27 ✅ Mobile back button — closes chat when open, returns to dashboard from notes; delete button color fixed
2026-07-27 ✅ Telegram link approval flow — /link creates a pending request; web dashboard Approve/Dismiss sets uid; telegramUsers Firestore rules added
2026-07-27 ✅ WeekOverview popup — floating button shows this week's targets + today's events within the next 3 hours
2026-07-27 ✅ Chat /help command — command list + command chips shown on first open
2026-09-02 ✅ Per-step LLM bubbles in chat history — each tool-loop round saved as its own assistant message; conversation window expanded welcome + last 50
2026-09-02 ✅ WeekOverview popup shows weekOf for each target + includes recurring targets; stale non-recurring targets dimmed with "past week" badge
2026-09-02 ✅ Prompts updated — 16h active window (07:00–23:00, sleep ~23:00–07:00 ±1h) in system prompts + plan/tplan templates; no more heavy-week overload warnings
2026-09-02 ✅ Prompt/tool updates — target estimatedHours clarified as TOTAL weekly hours; daily schedules include each day's hours directly in the task title
2026-09-02 ✅ Live RTDB-driven chat with streaming — client renders via onValue listener on chats/{userId}; server streams streaming:true (start + per-step) then streaming:false (final/error); header button contextual (Test Connection when empty / Unblock to clear stuck streaming)
2026-09-02 ✅ /archive persistence fix — archive exchange now streamed to RTDB (start + 🔧 step bubbles + reply, streaming:false) so the chat never gets stuck and lists refresh; !apiKey path persists an error terminal write too
2026-09-02 ✅ Newest-to-oldest chat feed — messages render latest at top (oldest pushed down); autoscrolls to top unless the user has scrolled down; scroll float button is now an ↑ arrow that jumps to the newest message

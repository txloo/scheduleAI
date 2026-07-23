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

const {onCall, onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ── Callable: testConnection (smoke test for emulator CORS) ──

exports.testConnection = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      logger.info(`testConnection called by ${request.auth?.uid || "anonymous"}`);
      return {ok: true, timestamp: new Date().toISOString()};
    },
);

// ── Tool definitions for LLM function calling ──

const TOOLS = [
  // ── Create ──
  {
    type: "function",
    function: {
      name: "createMainGoal",
      description: "Create a new main goal (long-term goal) for the user",
      parameters: {
        type: "object",
        properties: {
          title: {type: "string", description: "Title of the main goal"},
          description: {type: "string", description: "Detailed description of the goal"},
          targetDate: {type: "string", description: "Target completion date (ISO format, e.g. 2026-12-31)"},
          status: {type: "string", enum: ["not_started", "in_progress", "done"], description: "Status of the goal"},
        },
        required: ["title", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createTarget",
      description: "Create a new target for the user",
      parameters: {
        type: "object",
        properties: {
          text: {type: "string", description: "Description of the target"},
          priority: {type: "number", description: "Priority level 1-5 (1=lowest, 5=highest)"},
          estimatedHours: {type: "number", description: "Estimated hours needed"},
          status: {type: "string", enum: ["current", "upcoming", "recurring"], description: "Status of the target (current, upcoming, or recurring)"},
          mainGoalId: {type: "string", description: "Optional ID of an associated main goal"},
          weekOf: {type: "string", description: "ISO Monday date of the target's week (e.g. 2026-07-28). Used for sort order within same priority. Defaults to current week."},
        },
        required: ["text", "priority", "estimatedHours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEvent",
      description: "Create a new calendar event for the user",
      parameters: {
        type: "object",
        properties: {
          title: {type: "string", description: "Title of the event"},
          date: {type: "string", description: "Date of the event (ISO format, e.g. 2026-07-15)"},
          startTime: {type: "string", description: "Start time (HH:MM format, e.g. 09:00)"},
          endTime: {type: "string", description: "End time (HH:MM format, e.g. 10:00)"},
        },
        required: ["title", "date", "startTime", "endTime"],
      },
    },
  },
  // ── Update ──
  {
    type: "function",
    function: {
      name: "updateMainGoal",
      description: "Update an existing main goal. Only provided fields will be changed.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the main goal to update"},
          title: {type: "string", description: "New title"},
          description: {type: "string", description: "New description"},
          targetDate: {type: "string", description: "New target date (ISO format)"},
          status: {type: "string", enum: ["not_started", "in_progress", "done"], description: "New status"},
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateTarget",
      description: "Update an existing target. Only provided fields will be changed.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the target to update"},
          text: {type: "string", description: "New description"},
          priority: {type: "number", description: "New priority level 1-5"},
          estimatedHours: {type: "number", description: "New estimated hours"},
          status: {type: "string", enum: ["current", "upcoming", "recurring"], description: "New status"},
          mainGoalId: {type: "string", description: "New linked main goal ID (empty string to unlink)"},
          weekOf: {type: "string", description: "New target week (ISO Monday date)"},
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateEvent",
      description: "Update an existing calendar event. Only provided fields will be changed.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the event to update"},
          title: {type: "string", description: "New title"},
          date: {type: "string", description: "New date (ISO format)"},
          startTime: {type: "string", description: "New start time (HH:MM)"},
          endTime: {type: "string", description: "New end time (HH:MM)"},
        },
        required: ["id"],
      },
    },
  },
  // ── Delete ──
  {
    type: "function",
    function: {
      name: "deleteMainGoal",
      description: "Delete a main goal by its ID",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the main goal to delete"},
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteTarget",
      description: "Delete a target by its ID",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the target to delete"},
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteEvent",
      description: "Delete a calendar event by its ID",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "ID of the event to delete"},
        },
        required: ["id"],
      },
    },
  },
  // ── List / Read ──
  {
    type: "function",
    function: {
      name: "listMainGoals",
      description: "List all main goals for the user",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listTargets",
      description: "List targets for the user. Optionally filter by status.",
      parameters: {
        type: "object",
        properties: {
          status: {type: "string", enum: ["current", "upcoming", "recurring"], description: "Filter by status. Omit to list all targets."},
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listEvents",
      description: "List calendar events for a given week (defaults to current week if omitted)",
      parameters: {
        type: "object",
        properties: {
          weekOf: {type: "string", description: "ISO Monday date to start from (e.g. 2026-07-06). Defaults to current week."},
          weekEnd: {type: "string", description: "ISO Sunday date to end at (e.g. 2026-07-12). Defaults to current week's Sunday."},
        },
        required: [],
      },
    },
  },
  // ── Notes ──
  {
    type: "function",
    function: {
      name: "listNotes",
      description: "List notes for the user. Optionally fetch a single note by ID.",
      parameters: {
        type: "object",
        properties: {
          id: {type: "string", description: "Optional note ID. If provided, returns only that note. If omitted, returns all notes."},
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createNote",
      description: "Create a new note for the user",
      parameters: {
        type: "object",
        properties: {
          body: {type: "string", description: "The note content"},
        },
        required: ["body"],
      },
    },
  },
];

const MAX_TOOL_ROUNDS = 3;

const BUILDER_SYSTEM_PROMPT = [
  "You are Schedule AI's assistant. You manage the user's schedule stored in their database.",
  "You have NO knowledge of the user's data unless it is provided in the current message or you can access it through your tools.",
  "IMPORTANT: You MUST only use the exact tool names and parameter names defined in your tools list. Never invent tool names or parameters.",
  "",
  "DEFINITIONS:",
  "- Main Goals: Long-term, aspirational objectives that span weeks or months (e.g. \"Launch my startup\", \"Get fit\"). They have a title, optional description, optional target date, and status (not_started, in_progress, done). Use createMainGoal / updateMainGoal / deleteMainGoal / listMainGoals.",
  "- Targets: Short-term, actionable tasks for the current week (e.g. \"Finish report\", \"Exercise 3x\"). They have a text description, priority 1-5, estimated hours, and status (current, upcoming, recurring). Targets can be linked to a Main Goal via mainGoalId. Targets have an optional weekOf field (ISO Monday date) used for sort order within the same priority — when creating targets for a future week, set weekOf to that week's Monday. Use createTarget / updateTarget / deleteTarget / listTargets.",
  "- Events: Fixed calendar appointments with a specific date and time range (e.g. \"Team meeting, July 15, 09:00-10:00\"). Use createEvent / updateEvent / deleteEvent / listEvents.",
  "- Notes: Short text snippets for quick capture (e.g. \"Remember to buy milk\", \"Idea: write a blog post\"). They have an auto-incremented numeric ID and a body string. Use listNotes / createNote. Notes cannot be updated or deleted via tools — only created and listed.",
  "",
  "TOOLS:",
  "- createMainGoal: title (required), description, targetDate (ISO), status (not_started|in_progress|done, required)",
  "- createTarget: text (required), priority 1-5 (required), estimatedHours (required), status (current|upcoming|recurring), mainGoalId, weekOf (ISO Monday date for sort order)",
  "- createEvent: title (required), date ISO (required), startTime HH:MM (required), endTime HH:MM (required)",
  "- updateMainGoal: id (required), title, description, targetDate, status (not_started|in_progress|done)",
  "- updateTarget: id (required), text, priority, estimatedHours, status (current|upcoming|recurring), mainGoalId, weekOf",
  "- updateEvent: id (required), title, date, startTime, endTime",
  "- deleteMainGoal: id (required)",
  "- deleteTarget: id (required)",
  "- deleteEvent: id (required)",
  "- listMainGoals: (no parameters)",
  "- listTargets: status (current|upcoming|recurring, optional)",
  "- listEvents: weekOf (ISO Monday date, optional), weekEnd (ISO Sunday date, optional)",
  "- listNotes: id (optional, string) — returns a single note by ID, or all notes if omitted",
  "- createNote: body (required, string) — creates a new note with the given text",
  "",
  "TOOL CALL LIMIT:",
  `- You have a maximum of ${MAX_TOOL_ROUNDS} tool-calling rounds per message (after your first response). Once they run out, no more tools can be called.`,
  "- Do not waste rounds: batch ALL related tool calls into a single response array (e.g. every create/update/delete in one go) rather than one action per round.",
  "- If IDs are unknown, do read/list lookups first, then perform all writes together in your next response.",
  "- Complete every action the user requested within these rounds; if anything had to be dropped due to the limit, say so explicitly in your final answer.",
  "",
  "RULES:",
  "- When the current message includes data injected from /goals, /events, /targets, /plan, or /tplan, use that data directly — it is the user's actual data expanded inline. Do not ask the user to retype it.",
  "- For read requests (list, see, get, show): Call the appropriate tool immediately, then summarize results.",
  "- For write requests (create, update, delete): First gather ALL required details from the user through conversation. Present a summary and ask for confirmation. Only call the tool AFTER the user confirms. Never assume values for required fields.",
  "- For bulk operations (delete all, update all, rename many, etc.): First call the relevant list tool to collect every matching ID, then ask for confirmation. After confirmation, include ALL write tool calls in a single response as an array — do not execute them one at a time.",
  "- Never fabricate, guess, or hallucinate data.",
  "- When a tool returns a result, base your response ONLY on what the tool explicitly returned. Do not assume, extrapolate, or infer data that the tool did not provide. If a tool says 'not found', say exactly that — do not claim other data doesn't exist.",
  "- When executing multiple write operations at once, include ALL tool calls in a single response array. The system supports parallel tool execution.",
  "- When you mention any main goal, target, event, or note in your response, ALWAYS include its document ID in brackets like [id: <ID>]. This is critical for follow-up operations.",
].join("\n");

const PLANNER_SYSTEM_PROMPT = [
  "You are Schedule AI's planning assistant. Your role is to discuss, advise, and plan with the user about their schedule, main goals, targets, events, and notes.",
  "You have NO knowledge of the user's data unless it is provided in the current message or you can access it through your read-only tools.",
  "You are in PLANNER MODE. You CANNOT create, update, or delete anything.",
  "",
  "DEFINITIONS:",
  "- Main Goals: Long-term, aspirational objectives that span weeks or months.",
  "- Targets: Short-term, actionable tasks for the current week.",
  "- Events: Fixed calendar appointments with a specific date and time range.",
  "- Notes: Short text snippets for quick capture.",
  "",
  "YOUR TOOLS (read-only ONLY):",
  "- listMainGoals: (no parameters) — list all the user's main goals.",
  "- listTargets: status (current|upcoming|recurring, optional) — list the user's targets.",
  "- listEvents: weekOf (ISO Monday date, optional), weekEnd (ISO Sunday date, optional) — list the user's events.",
  "- listNotes: id (optional, string) — list the user's notes.",
  "",
  "RULES:",
  "- You may freely discuss, analyze, and help the user plan their week. Use your read tools to inspect their data and give informed advice.",
  "- You CANNOT create, update, or delete goals, targets, events, or notes. You have NO tools to do so.",
  "- If the user asks you to create, update, or delete something, DO NOT attempt it. Instead, tell the user what you would do and advise them to switch to Builder mode to execute it.",
  "- Only use the tools listed above. Do not attempt to call any other tools.",
  "- Always base your advice on real user data. Use the appropriate read tool before giving specific recommendations.",
  "- When you mention any main goal, target, event, or note in your response, ALWAYS include its document ID in brackets like [id: <ID>].",
].join("\n");

// Read-only tools available in Planner mode (reuses definitions from TOOLS)
const PLANNER_TOOLS = TOOLS.filter((t) =>
  ["listMainGoals", "listTargets", "listEvents", "listNotes"].includes(t.function.name)
);

// Hard server-side whitelist for tool calls in Planner mode
const PLANNER_ALLOWED = new Set(["listMainGoals", "listTargets", "listEvents", "listNotes"]);

function formatMainGoal(goal, index) {
  const statusEmoji = {"not_started": "⬜", "in_progress": "🔵", "done": "✅"};
  let line = `${index + 1}. ${statusEmoji[goal.status] || "❓"} ${goal.title}${goal.targetDate ? ` (due: ${goal.targetDate})` : ""} [id: ${goal.id}]`;
  if (goal.description) line += `\n${goal.description}`;
  return line;
}

function formatEventLine(event, index) {
  return `${index + 1}. ${event.title} (${event.date} ${event.startTime}-${event.endTime}) [id: ${event.id}]`;
}

function formatTargetLine(target, index) {
  const weekOf = target.weekOf ? ` Week of ${target.weekOf}` : "";
  return `${index + 1}. ${target.text} [Priority ${target.priority}, ${target.estimatedHours}h, ${target.status || "current"}${weekOf}] [id: ${target.id}]`;
}

function formatToolResult(toolName, result) {
  if (toolName === "listMainGoals") {
    if (!result.items || result.items.length === 0) return "Main Goals:\nNone";
    const lines = result.items.map((item, i) => {
      let line = `${i + 1}. ${item.title}${item.targetDate ? ` (due: ${item.targetDate})` : ""} (${item.status}) [id: ${item.id}]`;
      if (item.description) line += `\n${item.description}`;
      return line;
    });
    return `Main Goals:\n${lines.join("\n")}`;
  }
  if (toolName === "listTargets") {
    if (!result.items || result.items.length === 0) return "Targets:\nNone";
    const lines = result.items.map((item, i) => {
      const weekOf = item.weekOf ? ` Week of ${item.weekOf}` : "";
      return `${i + 1}. ${item.text} [Priority ${item.priority}, ${item.estimatedHours}h, ${item.status || "current"}${weekOf}] [id: ${item.id}]`;
    });
    return `Targets:\n${lines.join("\n")}`;
  }
  if (toolName === "listEvents") {
    if (!result.items || result.items.length === 0) return "Events:\nNone";
    const lines = result.items.map((item, i) => `${i + 1}. ${item.title} (${item.date} ${item.startTime}-${item.endTime}) [id: ${item.id}]`);
    return `Events:\n${lines.join("\n")}`;
  }
  if (toolName === "listNotes") {
    if (!result.items || result.items.length === 0) return "Notes:\nNone";
    const lines = result.items.map((item, i) => {
      const preview = item.body.length > 80 ? item.body.slice(0, 80) + "..." : item.body;
      return `${i + 1}. ${preview} [id: ${item.id}]`;
    });
    return `Notes:\n${lines.join("\n")}`;
  }
  if (result.id && result.summary) return `${result.summary} [id: ${result.id}]`;
  return null;
}

async function fetchMainGoalsForUser(uid) {
  const snap = await db.collection("users").doc(uid).collection("goals").get();
  const goals = [];
  snap.forEach((doc) => {
    const data = doc.data();
    goals.push({id: doc.id, ...data});
  });
  goals.sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (a.targetDate || "").localeCompare(b.targetDate || "") || (a.title || "").localeCompare(b.title || "");
  });
  return goals;
}

async function fetchEventsFromToday(uid) {
  const today = getCurrentDate();
  const eventsSnap = await db
      .collection("users")
      .doc(uid)
      .collection("events")
      .where("date", ">=", today)
      .get();
  const events = [];
  eventsSnap.forEach((doc) => {
    events.push({id: doc.id, ...doc.data()});
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return events;
}

async function fetchNotesForUser(uid) {
  const snap = await db.collection("users").doc(uid).collection("notes").get();
  const notes = [];
  snap.forEach((doc) => {
    if (doc.id === "_meta") return;
    notes.push({id: doc.id, ...doc.data()});
  });
  notes.sort((a, b) => Number(a.id) - Number(b.id));
  return notes;
}

async function fetchTargetsForUser(uid, targetStatus) {
  let targetsQuery = db
      .collection("users")
      .doc(uid)
      .collection("targets");
  if (targetStatus) {
    const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
    targetsQuery = targetsQuery.where("status", "in", statuses);
  }
  const targetsSnap = await targetsQuery.get();
  const targets = [];
  targetsSnap.forEach((doc) => {
    targets.push({id: doc.id, ...doc.data()});
  });
  targets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return targets;
}

// ── Shared: expand commands inline in a user message ──

async function expandCommands(uid, text) {
  let result = text;

  // Handle /archive as an action (not expansion)
  if (/^\/archive$/i.test(result.trim())) {
    return {type: "action", action: "archive"};
  }

  // Expand /tplan before /plan to avoid partial match
  if (/\/tplan\b/i.test(result)) {
    const template = await getPromptTemplate("tplan");
    if (template) {
      const weekOf = getCurrentWeekMonday();
      const weekEnd = getCurrentWeekSunday();
      const today = getCurrentDate();
      const userData = await fetchUserData(uid, weekOf, undefined, weekEnd);
      const filled = fillTemplate(template.userTemplate, {
        targets: userData.targets.length ? userData.targets.join("\n") : "No targets set.",
        events: userData.events.length ? userData.events.join("\n") : "No events scheduled.",
        mainGoals: userData.mainGoals.length ? userData.mainGoals.join("\n") : "No main goals set.",
        weekOf,
        today,
      });
      const expansion = template.systemPrompt + "\n\n" + filled;
      result = result.replace(/\/tplan\b/gi, expansion);
    } else {
      result = result.replace(/\/tplan\b/gi, "(The /tplan command isn't configured yet. Ask the admin to set up prompts/tplan in the database.)");
    }
  }

  // Expand /plan
  if (/\/plan\b/i.test(result)) {
    const template = await getPromptTemplate("plan");
    if (template) {
      const weekOf = getCurrentWeekMonday();
      const weekEnd = getCurrentWeekSunday();
      const today = getCurrentDate();
      const userData = await fetchUserData(uid, weekOf, ["current", "recurring"], weekEnd);
      const filled = fillTemplate(template.userTemplate, {
        targets: userData.targets.length ? userData.targets.join("\n") : "No current targets set.",
        events: userData.events.length ? userData.events.join("\n") : "No events scheduled.",
        weekOf,
        today,
      });
      const expansion = template.systemPrompt + "\n\n" + filled;
      result = result.replace(/\/plan\b/gi, expansion);
    } else {
      result = result.replace(/\/plan\b/gi, "(The /plan command isn't configured yet. Ask the admin to set up prompts/plan in the database.)");
    }
  }

  // Expand /goals
  if (/\/goals\b/i.test(result)) {
    const goals = await fetchMainGoalsForUser(uid);
    const currentGoals = goals.filter((g) => g.status !== "done");
    const goalsText = currentGoals.length
      ? currentGoals.map((g, i) => formatMainGoal(g, i)).join("\n")
      : "No current goals set.";
    result = result.replace(/\/goals\b/gi, `(MAIN GOALS:\n${goalsText})`);
  }

  // Expand /events
  if (/\/events\b/i.test(result)) {
    const events = await fetchEventsFromToday(uid);
    const eventsText = events.length
      ? events.map((e, i) => formatEventLine(e, i)).join("\n")
      : "No upcoming events.";
    result = result.replace(/\/events\b/gi, `(EVENTS:\n${eventsText})`);
  }

  // Expand /targets
  if (/\/targets\b/i.test(result)) {
    const targets = await fetchTargetsForUser(uid, ["current", "recurring"]);
    const targetsText = targets.length
      ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
      : "No current targets set.";
    result = result.replace(/\/targets\b/gi, `(TARGETS:\n${targetsText})`);
  }

  // Expand /week
  if (/\/week\b/i.test(result)) {
    const monday = getCurrentWeekMonday();
    const sunday = getCurrentWeekSunday();
    const mondayDate = new Date(monday + "T00:00:00");
    const sundayDate = new Date(sunday + "T00:00:00");
    const opts = {month: "short", day: "numeric"};
    const label = `${mondayDate.toLocaleDateString("en-US", opts)} – ${sundayDate.toLocaleDateString("en-US", opts)}, ${sundayDate.getFullYear()}`;
    result = result.replace(/\/week\b/gi, `(WEEK: ${label})`);
  }

  // Expand /current
  if (/\/current\b/i.test(result)) {
    const targets = await fetchTargetsForUser(uid, "current");
    const text = targets.length
      ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
      : "No current targets.";
    result = result.replace(/\/current\b/gi, `(CURRENT TARGETS:\n${text})`);
  }

  // Expand /upcoming
  if (/\/upcoming\b/i.test(result)) {
    const targets = await fetchTargetsForUser(uid, "upcoming");
    const text = targets.length
      ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
      : "No upcoming targets.";
    result = result.replace(/\/upcoming\b/gi, `(UPCOMING TARGETS:\n${text})`);
  }

  // Expand /recurring
  if (/\/recurring\b/i.test(result)) {
    const targets = await fetchTargetsForUser(uid, "recurring");
    const text = targets.length
      ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
      : "No recurring targets.";
    result = result.replace(/\/recurring\b/gi, `(RECURRING TARGETS:\n${text})`);
  }

  return {type: "message", text: result};
}

// ── Shared: handle /archive action ──

async function handleArchive(uid) {
  const today = getCurrentDate();
  const weekOf = getCurrentWeekMonday();
  const weekEnd = getCurrentWeekSunday();
  const weekStartMs = new Date(weekOf + "T00:00:00").getTime();
  const weekEndMs = new Date(weekEnd + "T00:00:00").getTime();
  let targetsArchived = 0;
  let targetsSkipped = 0;
  let eventsArchived = 0;
  let goalsArchived = 0;

  const targetsSnap = await db.collection("users").doc(uid).collection("targets")
      .where("status", "==", "current").get();
  const goalsSnap = await db.collection("users").doc(uid).collection("goals").get();
  const goalsMap = {};
  goalsSnap.forEach((doc) => { goalsMap[doc.id] = doc.data(); });

  for (const tDoc of targetsSnap.docs) {
    const t = tDoc.data();
    if (t.weekOf && getMondayOf(t.weekOf) >= weekOf) {
      targetsSkipped++;
      continue;
    }
    const goal = t.mainGoalId ? goalsMap[t.mainGoalId] : null;
    await db.collection("archives").add({
      userId: uid,
      type: "target",
      name: t.text,
      weekStart: weekStartMs,
      weekEnd: weekEndMs,
      goalId: t.mainGoalId || null,
      goalTitle: goal ? goal.title : null,
      archivedAt: FieldValue.serverTimestamp(),
    });
    await tDoc.ref.delete();
    targetsArchived++;
  }

  const eventsSnap = await db.collection("users").doc(uid).collection("events")
      .where("date", "<", today).get();
  for (const eDoc of eventsSnap.docs) {
    const e = eDoc.data();
    await db.collection("archives").add({
      userId: uid,
      type: "event",
      name: e.title,
      weekStart: new Date(e.date + "T00:00:00").getTime(),
      weekEnd: new Date(e.date + "T00:00:00").getTime(),
      archivedAt: FieldValue.serverTimestamp(),
    });
    await eDoc.ref.delete();
    eventsArchived++;
  }

  const doneGoalsSnap = await db.collection("users").doc(uid).collection("goals")
      .where("status", "==", "done").get();
  for (const gDoc of doneGoalsSnap.docs) {
    await db.collection("archives").add({
      userId: uid,
      type: "goal",
      name: gDoc.data().title,
      weekStart: weekStartMs,
      weekEnd: weekEndMs,
      archivedAt: FieldValue.serverTimestamp(),
    });
    await gDoc.ref.delete();
    goalsArchived++;
  }

  const skippedNote = targetsSkipped > 0 ? ` ⚠️ Skipped ${targetsSkipped} target(s) still within their week` : "";

  return {
    reply: `📦 Archived: ${targetsArchived} target(s), ${eventsArchived} event(s), ${goalsArchived} goal(s)${skippedNote}`,
    model: "archive",
    systemMessage: null,
    steps: [{tool: "ArchiveTargets"}, {tool: "ArchiveEvents"}, {tool: "ArchiveMainGoals"}],
  };
}

// ── Shared: single OpenCode Zen API call with hard timeout ──

const ZEN_API_URL = "https://opencode.ai/zen/v1/chat/completions";
const ZEN_CALL_TIMEOUT_MS = 60000;
const TOOL_LOOP_BUDGET_MS = 240000;

async function callZen(headers, body) {
  return fetch(ZEN_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ZEN_CALL_TIMEOUT_MS),
  });
}

// ── Shared: call LLM with tool-calling loop (up to 3 rounds) ──

async function callLLMWithTools(uid, messages, apiKey, mode = "builder") {
  const systemPrompt = mode === "planner" ? PLANNER_SYSTEM_PROMPT : BUILDER_SYSTEM_PROMPT;
  const tools = mode === "planner" ? PLANNER_TOOLS : TOOLS;
  const sessionId = `ses_schedule-ai-${uid.slice(0, 8)}`;
  const requestId = `msg_${crypto.randomBytes(16).toString("hex")}`;
  const opencodeHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "x-opencode-client": "cli",
    "x-opencode-session": sessionId,
    "x-opencode-request": requestId,
    "x-opencode-project": "global",
    "User-Agent": "opencode/1.17.0",
  };
  const deadline = Date.now() + TOOL_LOOP_BUDGET_MS;

  let response;
  try {
    response = await callZen(opencodeHeaders, {
      model: "big-pickle",
      messages: [{role: "system", content: systemPrompt}, ...messages],
      tools,
      tool_choice: "auto",
    });
  } catch (err) {
    logger.error(`OpenCode Zen API request failed:`, err.message || err);
    return {
      reply: "Sorry, the AI service could not be reached. Please try again later.",
      model: "opencode/big-pickle",
      systemMessage: null,
    };
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`OpenCode Zen API error: ${response.status} ${errorText}`);
    return {
      reply: `Sorry, the AI service returned an error (${response.status}). Please try again later.`,
      model: "opencode/big-pickle",
      systemMessage: null,
    };
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message;

  logger.info(`LLM response: tool_calls=${JSON.stringify(choice?.tool_calls?.length || 0)}, content_length=${(choice?.content || "").length}, finish_reason=${data.choices?.[0]?.finish_reason}`);

  // Resolve tool calls: prefer native API format, fall back to XML parsing
  let toolCalls = choice?.tool_calls && choice.tool_calls.length > 0
    ? choice.tool_calls
    : parseXmlToolCalls(choice?.content || "");

  // Enforce Planner mode: only allow read-only tools. Blocked calls are dropped.
  if (mode === "planner" && toolCalls.length > 0) {
    const allowed = toolCalls.filter((tc) => PLANNER_ALLOWED.has(tc.function.name));
    const blocked = toolCalls.filter((tc) => !PLANNER_ALLOWED.has(tc.function.name));
    if (blocked.length > 0) {
      blocked.forEach((tc) => logger.warn(`Tool "${tc.function.name}" blocked in planner mode for user ${uid}`));
    }
    toolCalls = allowed;
  }

  // Check if the LLM wants to call tools
  if (toolCalls.length > 0) {
    logger.info(`Executing ${toolCalls.length} tool call(s):`, toolCalls.map((tc) => tc.function.name));

    // Execute all tool calls
    const toolResults = [];
    const steps = [];
    const toolOutputs = [];
    for (const toolCall of toolCalls) {
      const result = await handleToolCall(toolCall, uid);
      toolResults.push(result);
      steps.push({tool: `${toolCall.function.name}: ${result.result.summary || result.result.error || "Action completed"}`});
      const output = formatToolResult(toolCall.function.name, result.result);
      if (output) toolOutputs.push(output);
    }

    // Strip XML tool call blocks from content before follow-up
    let cleanContent = choice?.content || "";
    if (choice?.tool_calls === undefined || (choice?.tool_calls && choice.tool_calls.length === 0)) {
      cleanContent = cleanContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
    }

    // Build assistant message with proper tool_calls format
    const assistantMsg = toolCalls.length > 0
      ? {role: "assistant", content: choice.content || null, tool_calls: toolCalls}
      : {role: "assistant", content: cleanContent || "Let me check that for you."};

    // Initial conversation for follow-up rounds (include system prompt for mode context)
    let conversationMessages = [
      {role: "system", content: systemPrompt},
      ...messages,
      assistantMsg,
      ...toolResults.map((tr) => ({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: JSON.stringify(tr.result),
      })),
    ];

    // Multi-step tool loop: up to 3 rounds of tool execution
    let finalReply = null;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (Date.now() >= deadline) break;
      const body = {model: "big-pickle", messages: conversationMessages, tools};

      let followUpResponse;
      try {
        followUpResponse = await callZen(opencodeHeaders, body);
      } catch (err) {
        logger.error(`OpenCode Zen API follow-up failed:`, err.message || err);
        break;
      }

      if (!followUpResponse.ok) {
        const errorText = await followUpResponse.text();
        logger.error(`OpenCode Zen API follow-up error: ${followUpResponse.status} ${errorText}`);
        const summaries = steps.map((s) => s.tool).join("\n");
        const listPrefix = toolOutputs.length > 0 ? toolOutputs.join("\n\n") + "\n\n" : "";
        return {reply: `${listPrefix}I've completed the following actions:\n${summaries}`, steps, model: "opencode/big-pickle", systemMessage: null};
      }

      const data = await followUpResponse.json();
      const msg = data.choices?.[0]?.message;
      let nextToolCalls = msg?.tool_calls && msg.tool_calls.length > 0
        ? msg.tool_calls
        : parseXmlToolCalls(msg?.content || "");

      // Enforce Planner mode on follow-up rounds: only read-only tools allowed
      if (mode === "planner" && nextToolCalls.length > 0) {
        const allowed = nextToolCalls.filter((tc) => PLANNER_ALLOWED.has(tc.function.name));
        const blocked = nextToolCalls.filter((tc) => !PLANNER_ALLOWED.has(tc.function.name));
        if (blocked.length > 0) {
          blocked.forEach((tc) => logger.warn(`Tool "${tc.function.name}" blocked in planner mode (follow-up) for user ${uid}`));
        }
        nextToolCalls = allowed;
      }

      // No more tool calls — return text response
      if (nextToolCalls.length === 0) {
        finalReply = msg?.content || "Actions completed.";
        break;
      }

      // Stop if the time budget is exhausted — do not start new work
      if (Date.now() >= deadline) break;

      // Execute next round of tool calls
      logger.info(`Round ${round + 2}: executing ${nextToolCalls.length} tool call(s):`, nextToolCalls.map((tc) => tc.function.name));

      const nextAssistantMsg = nextToolCalls.length > 0
        ? {role: "assistant", content: msg.content || null, tool_calls: nextToolCalls}
        : {role: "assistant", content: msg?.content || ""};

      conversationMessages = [
        ...conversationMessages,
        nextAssistantMsg,
      ];

      for (const tc of nextToolCalls) {
        const result = await handleToolCall(tc, uid);
        steps.push({tool: `${tc.function.name}: ${result.result.summary || result.result.error || "Action completed"}`});
        const output = formatToolResult(tc.function.name, result.result);
        if (output) toolOutputs.push(output);
        conversationMessages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.result),
        });
      }
    }

    // Force a summary response if the loop ended without a text reply
    if (!finalReply) {
      if (Date.now() < deadline) {
        conversationMessages.push({role: "user", content: "Summarize what you just did for the user in a natural, friendly way."});
        try {
          const summaryResponse = await callZen(opencodeHeaders, {model: "big-pickle", messages: conversationMessages});
          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            finalReply = summaryData.choices?.[0]?.message?.content || "Actions completed.";
          }
        } catch (err) {
          logger.error(`OpenCode Zen API summary failed:`, err.message || err);
        }
      }
      if (!finalReply) {
        if (steps.length === 0) {
          finalReply = "Sorry, I ran out of time before I could do anything. Please try again.";
        } else {
          const summaries = steps.map((s) => s.tool).join("\n");
          finalReply = `I've completed the following actions:\n${summaries}`;
        }
      }
    }

    const listPrefix = toolOutputs.length > 0 ? toolOutputs.join("\n\n") + "\n\n" : "";
    return {reply: `${listPrefix}${finalReply || "Actions completed."}`, steps, model: "opencode/big-pickle", systemMessage: null};
  }

  // No tool calls — return the LLM's text response
  const reply = choice?.content || "No response from AI.";
  return {reply, model: "opencode/big-pickle", systemMessage: null};
}

// ── Shared: welcome message + history constants ──

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "\ud83d\udc4b Hi! I'm your Schedule AI assistant. I can help you plan your week, answer questions about scheduling, or just chat. What can I help you with?",
};

// ── Shared: process a user message (core logic for both web and Telegram) ──

async function processMessage(uid, text, options = {}) {
  const {context = "web", mode} = options;
  const chatPath = context === "telegram" ? `chats/telegram/${uid}` : `chats/${uid}`;
  const chatRef = rtdb.ref(chatPath);

  try {
    // Fetch existing history from RTDB
    const chatSnap = await chatRef.once("value");
    const chatData = chatSnap.val();
    let messages = (chatData?.messages && Array.isArray(chatData.messages) && chatData.messages.length > 0)
      ? chatData.messages
      : [WELCOME_MESSAGE];

    // Determine mode: explicit option wins; otherwise, Telegram uses RTDB-persisted mode, web defaults to builder
    let activeMode = mode || chatData?.mode || "builder";
    if (activeMode !== "planner") activeMode = "builder";

    // Handle /clear command
    if (/^\/clear$/i.test(text.trim())) {
      await chatRef.set({messages: [WELCOME_MESSAGE], updatedAt: Date.now(), mode: activeMode});
      return {reply: "Chat history cleared.", model: "opencode/big-pickle", systemMessage: null, messages: [WELCOME_MESSAGE], mode: activeMode};
    }

    // Expand commands inline
    const expanded = await expandCommands(uid, text);

    // Handle /archive action
    if (expanded.type === "action" && expanded.action === "archive") {
      logger.info(`[processMessage] ${context}: /archive by ${uid}`);
      const archiveResult = await handleArchive(uid);
      return {...archiveResult, messages};
    }

    // Send expanded message to LLM with tools
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      logger.error("LLM_API_KEY not configured");
      return {reply: "LLM is not configured.", model: "opencode/big-pickle", systemMessage: null, messages};
    }

    logger.info(`[processMessage] ${context}: user ${uid}, message length ${expanded.text.length}`);

    // Build conversation from history + expanded message (system prompt injected by callLLMWithTools)
    const historyMessages = messages.filter((m) =>
      m.role !== "system" && m.content !== WELCOME_MESSAGE.content
    );
    const userMsg = {role: "user", content: expanded.text};
    const fullMessages = [
      ...historyMessages,
      userMsg,
    ];

    const result = await callLLMWithTools(uid, fullMessages, apiKey, activeMode);

    // Build updated history: append user + assistant messages
    const updatedHistory = [...historyMessages, userMsg, {role: "assistant", content: result.reply}];

    // Sliding window: keep welcome message + last 30 entries
    const finalMessages = updatedHistory.length > 30
      ? [WELCOME_MESSAGE, ...updatedHistory.slice(-30)]
      : [WELCOME_MESSAGE, ...updatedHistory];

    // Persist to RTDB (mode only persisted for Telegram context)
    const saveData = context === "telegram"
      ? {messages: finalMessages, updatedAt: Date.now(), mode: activeMode}
      : {messages: finalMessages, updatedAt: Date.now()};
    await chatRef.set(saveData);

    return {...result, messages: finalMessages, mode: activeMode};
  } catch (err) {
    logger.error(`[processMessage] ${context} error for user ${uid}:`, err);
    return {
      reply: "Sorry, an error occurred. Please try again.",
      model: "opencode/big-pickle",
      systemMessage: null,
      messages: [],
    };
  }
}

/**
 * Handles an LLM tool call by routing to the appropriate handler.
 * @param {Object} toolCall - The tool call object { id, type, function: { name, arguments } }
 * @param {string} uid - The authenticated user's UID
 * @returns {Promise<{toolCallId: string, result: Object}>}
 */
async function handleToolCall(toolCall, uid) {
  const {id, function: {name, arguments: argsJson}} = toolCall;

  try {
    const args = JSON.parse(argsJson);
    switch (name) {
    // ── Create ──

    case "createMainGoal": {
      const docRef = await db.collection("users").doc(uid).collection("goals").add({
        title: args.title,
        description: args.description || null,
        targetDate: args.targetDate || null,
        status: args.status,
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        toolCallId: id,
        result: {success: true, id: docRef.id, summary: `Created main goal "${args.title}"`},
      };
    }

    case "createTarget": {
      const targetData = {
        text: args.text,
        priority: args.priority,
        estimatedHours: args.estimatedHours,
        status: args.status || "current",
        weekOf: args.weekOf ? getMondayOf(args.weekOf) : null,
        createdAt: FieldValue.serverTimestamp(),
      };
      if (args.mainGoalId) targetData.mainGoalId = args.mainGoalId;
      const docRef = await db.collection("users").doc(uid).collection("targets").add(targetData);
      return {
        toolCallId: id,
        result: {success: true, id: docRef.id, summary: `Created target "${args.text}" (${targetData.status})`},
      };
    }

    case "createEvent": {
      const docRef = await db.collection("users").doc(uid).collection("events").add({
        title: args.title,
        date: args.date,
        startTime: args.startTime,
        endTime: args.endTime,
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        toolCallId: id,
        result: {success: true, id: docRef.id, summary: `Created event "${args.title}" on ${args.date} ${args.startTime}-${args.endTime}`},
      };
    }

    // ── Update ──

    case "updateMainGoal": {
      const ref = db.collection("users").doc(uid).collection("goals").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Main goal not found"}};
      const updates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.targetDate !== undefined) updates.targetDate = args.targetDate;
      if (args.status !== undefined) updates.status = args.status;
      await ref.update(updates);
      return {
        toolCallId: id,
        result: {success: true, id: args.id, summary: `Updated main goal "${args.id}"`},
      };
    }

    case "updateTarget": {
      const ref = db.collection("users").doc(uid).collection("targets").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Target not found"}};
      const updates = {};
      if (args.text !== undefined) updates.text = args.text;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.estimatedHours !== undefined) updates.estimatedHours = args.estimatedHours;
      if (args.status !== undefined) updates.status = args.status;
      if (args.mainGoalId !== undefined) updates.mainGoalId = args.mainGoalId || FieldValue.delete();
      if (args.weekOf !== undefined) updates.weekOf = args.weekOf ? getMondayOf(args.weekOf) : null;
      await ref.update(updates);
      return {
        toolCallId: id,
        result: {success: true, id: args.id, summary: `Updated target "${args.id}"`},
      };
    }

    case "updateEvent": {
      const ref = db.collection("users").doc(uid).collection("events").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Event not found"}};
      const updates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.date !== undefined) updates.date = args.date;
      if (args.startTime !== undefined) updates.startTime = args.startTime;
      if (args.endTime !== undefined) updates.endTime = args.endTime;
      await ref.update(updates);
      return {
        toolCallId: id,
        result: {success: true, id: args.id, summary: `Updated event "${args.id}"`},
      };
    }

    // ── Delete ──

    case "deleteMainGoal": {
      const ref = db.collection("users").doc(uid).collection("goals").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Main goal not found"}};
      await ref.delete();
      return {
        toolCallId: id,
        result: {success: true, summary: `Deleted main goal "${snap.data().title}" (id: ${args.id})`},
      };
    }

    case "deleteTarget": {
      const ref = db.collection("users").doc(uid).collection("targets").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Target not found"}};
      await ref.delete();
      return {
        toolCallId: id,
        result: {success: true, summary: `Deleted target "${snap.data().text}" (id: ${args.id})`},
      };
    }

    case "deleteEvent": {
      const ref = db.collection("users").doc(uid).collection("events").doc(args.id);
      const snap = await ref.get();
      if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Event not found"}};
      await ref.delete();
      return {
        toolCallId: id,
        result: {success: true, summary: `Deleted event "${snap.data().title}" (id: ${args.id})`},
      };
    }

    // ── List / Read ──

    case "listMainGoals": {
  const snap = await db.collection("users").doc(uid).collection("goals").get();
      const items = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const item = {id: doc.id, ...data};
        if (item.createdAt && item.createdAt.toDate) item.createdAt = item.createdAt.toDate().toISOString();
        items.push(item);
      });
      return {
        toolCallId: id,
        result: {success: true, count: items.length, items, summary: `Listed ${items.length} main goal(s)`},
      };
    }

    case "listTargets": {
      let q = db.collection("users").doc(uid).collection("targets");
      if (args.status) {
        q = q.where("status", "==", args.status);
      }
      const snap = await q.get();
      const items = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const item = {id: doc.id, ...data};
        if (item.createdAt && item.createdAt.toDate) item.createdAt = item.createdAt.toDate().toISOString();
        items.push(item);
      });
      return {
        toolCallId: id,
        result: {success: true, count: items.length, items, summary: `Listed ${items.length} target(s)`},
      };
    }

    case "listEvents": {
      const weekOf = args.weekOf || getCurrentWeekMonday();
      const weekEnd = args.weekEnd || getCurrentWeekSunday();
      let eventsQuery = db.collection("users").doc(uid).collection("events").where("date", ">=", weekOf).where("date", "<=", weekEnd);
      const snap = await eventsQuery.get();
      const items = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const item = {id: doc.id, ...data};
        if (item.createdAt && item.createdAt.toDate) item.createdAt = item.createdAt.toDate().toISOString();
        items.push(item);
      });
      return {
        toolCallId: id,
        result: {success: true, count: items.length, items, summary: `Listed ${items.length} event(s)`},
      };
    }

    // ── Notes ──

    case "listNotes": {
      if (args.id) {
        const snap = await db.collection("users").doc(uid).collection("notes").doc(args.id).get();
        if (!snap.exists) return {toolCallId: id, result: {success: false, error: "Note not found"}};
        const item = {id: snap.id, ...snap.data()};
        return {
          toolCallId: id,
          result: {success: true, count: 1, items: [item], summary: `Fetched note #${item.id}`},
        };
      }
      const notes = await fetchNotesForUser(uid);
      return {
        toolCallId: id,
        result: {success: true, count: notes.length, items: notes, summary: `Listed ${notes.length} note(s)`},
      };
    }

    case "createNote": {
      const notesRef = db.collection("users").doc(uid).collection("notes");
      const metaRef = notesRef.doc("_meta");
      const metaSnap = await metaRef.get();
      let nextId = 1;
      if (metaSnap.exists) {
        nextId = (metaSnap.data().nextIndex || 0) + 1;
        await metaRef.update({nextIndex: nextId});
      } else {
        await metaRef.set({nextIndex: nextId});
      }
      const noteRef = notesRef.doc(String(nextId));
      await noteRef.set({body: args.body, createdAt: FieldValue.serverTimestamp()});
      return {
        toolCallId: id,
        result: {success: true, id: String(nextId), summary: `Created note #${nextId}`},
      };
    }

    default:
      return {
        toolCallId: id,
        result: {success: false, error: `Unknown tool: ${name}`},
      };
    }
  } catch (err) {
    logger.error(`Tool "${name}" failed for user ${uid}:`, err.message || err);
    return {
      toolCallId: id,
      result: {success: false, error: err.message || String(err)},
    };
  }
}

// ── Helper: parse XML tool calls from big-pickle model response ──

function parseXmlToolCalls(content) {
  if (!content || !content.includes("<tool_call>")) return [];
  const calls = [];
  const callRegex = /<tool_call>\s*<function>([\s\S]*?)<\/function>\s*<parameters>([\s\S]*?)<\/parameters>\s*<\/tool_call>/g;
  let match;
  while ((match = callRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const paramXml = match[2];
    const args = {};
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let pMatch;
    while ((pMatch = paramRegex.exec(paramXml)) !== null) {
      args[pMatch[1]] = pMatch[2].trim();
    }
    calls.push({
      id: `xml_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: "function",
      function: {name, arguments: JSON.stringify(args)},
    });
  }
  return calls;
}

// ── Helper: get the ISO date string for the current week's Monday ──

function getCurrentWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ── Helper: get the ISO date string for the current week's Sunday ──

function getCurrentWeekSunday() {
  const monday = getCurrentWeekMonday();
  const d = new Date(monday + "T00:00:00");
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

// ── Helper: get today's ISO date string ──

function getCurrentDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

// ── Helper: fetch a prompt template from RTDB ──

const rtdb = admin.database();

async function getPromptTemplate(command) {
  const snap = await rtdb.ref(`prompts/${command}`).once("value");
  return snap.val();
}

// ── Helper: fetch user's targets and events for placeholder filling ──

async function fetchUserData(uid, weekOf, targetStatus, weekEnd) {
  let eventsQuery = db
      .collection("users")
      .doc(uid)
      .collection("events")
      .where("date", ">=", weekOf);
  if (weekEnd) {
    eventsQuery = eventsQuery.where("date", "<=", weekEnd);
  }
  const eventsSnap = await eventsQuery.get();
  const events = [];
  eventsSnap.forEach((doc) => {
    const d = doc.data();
    events.push(`${d.title} (${d.date} ${d.startTime}-${d.endTime})`);
  });

  let targetsQuery = db
      .collection("users")
      .doc(uid)
      .collection("targets");
  if (targetStatus) {
    const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
    targetsQuery = targetsQuery.where("status", "in", statuses);
  }
  const targetsSnap = await targetsQuery.get();
  const targets = [];
  targetsSnap.forEach((doc) => {
    const d = doc.data();
    targets.push(`${d.text} [Priority ${d.priority}, ${d.estimatedHours}h, ${d.status || "current"}]`);
  });

  const mainGoalsSnap = await db
      .collection("users")
      .doc(uid)
      .collection("goals")
      .get();
  const mainGoals = [];
  mainGoalsSnap.forEach((doc) => {
    const d = doc.data();
    mainGoals.push(`${d.title} (${d.status})${d.description ? `\n${d.description}` : ""}`);
  });

  return {events, targets, mainGoals};
}

// ── Helper: fill template placeholders ──

function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// ── HTTP: telegramWebhook (called by Telegram when users message the bot) ──
//
// Setup: After deploying, run:
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://asia-southeast1-scheduleai-df477.cloudfunctions.net/telegramWebhook"
//
// Then Telegram will POST updates to this endpoint whenever users message the bot.

const TELEGRAM_MAX_LEN = 4096;

async function sendTelegramMessage(chatId, text, token, parseMode) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LEN);
    if (splitAt <= 0) splitAt = TELEGRAM_MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  for (const chunk of chunks) {
    const body = {chat_id: chatId, text: chunk};
    if (parseMode) body.parse_mode = parseMode;
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    if (parseMode && !resp.ok) {
      delete body.parse_mode;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
    }
  }
}

exports.telegramWebhook = onRequest(
    {maxInstances: 10, region: "asia-southeast1", timeoutSeconds: 300},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        logger.error("TELEGRAM_BOT_TOKEN not configured");
        res.status(500).send("Bot not configured");
        return;
      }

      const update = req.body;
      const chatId = update?.message?.chat?.id;
      const text = (update?.message?.text || "").trim();
      const fromId = update?.message?.from?.id;

      if (!chatId || !text) {
        res.status(200).send("OK");
        return;
      }

      logger.info(`Telegram message from ${fromId}: "${text}"`);

      // Send "Thinking..." indicator immediately
      await sendTelegramMessage(chatId, "\ud83e\udd14 Thinking...", token);

      try {
        let reply;

        // ── Telegram-specific commands (not in shared core) ──

        if (/^\/start/.test(text)) {
          reply = "👋 Welcome to Schedule AI!\n\n" +
          "I can help you plan your week. First, link your account:\n" +
          "Send me your Firebase email to get started.\n\n" +
          "Commands:\n" +
          "/link <email> — Link your Telegram to Firebase\n" +
          "/today — Show today's date\n" +
          "/week — Show current week date range\n" +
          "/current — Show current targets\n" +
          "/upcoming — Show upcoming targets\n" +
          "/recurring — Show recurring targets\n" +
          "/goals — Show your main goals (paste into chat)\n" +
          "/targets — Show your targets (paste into chat)\n" +
          "/events — Show upcoming events (paste into chat)\n" +
          "/tplan — Generate new targets for this week\n" +
          "/plan — Create a daily schedule\n" +
          "/mode — Show current mode (/mode planner|builder to switch)\n" +
          "/archive — Archive current targets, past events, completed goals\n" +
          "/clear — Reset chat history";
        } else if (/^\/link\s+/i.test(text)) {
          const email = text.replace(/^\/link\s+/i, "").trim();
          const existing = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (existing.exists && existing.data().uid && !existing.data().pending) {
            reply = `✅ Already linked to ${existing.data().email}.`;
          } else {
            await db.collection("telegramUsers").doc(String(fromId)).set({
              email,
              chatId,
              linkedAt: FieldValue.serverTimestamp(),
              pending: true,
            });
            reply = `🔗 Link request sent for ${email}. Open the Schedule AI web app to approve.`;
          }
        } else if (/^\/today$/i.test(text)) {
          const today = getCurrentDate();
          const todayDate = new Date(today + "T00:00:00");
          const options = {weekday: "long", month: "short", day: "numeric", year: "numeric"};
          reply = `📆 Today: ${todayDate.toLocaleDateString("en-US", options)}`;
        } else if (/^\/week$/i.test(text)) {
          const monday = getCurrentWeekMonday();
          const sunday = getCurrentWeekSunday();
          const mondayDate = new Date(monday + "T00:00:00");
          const sundayDate = new Date(sunday + "T00:00:00");
          const opts = {month: "short", day: "numeric"};
          const label = `${mondayDate.toLocaleDateString("en-US", opts)} – ${sundayDate.toLocaleDateString("en-US", opts)}, ${sundayDate.getFullYear()}`;
          reply = `📅 Current week: ${label}`;
        } else if (/^\/current$/i.test(text)) {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists || !userDoc.data().uid) {
            reply = "❌ Link your account first with /link <email>";
          } else {
            const targets = await fetchTargetsForUser(userDoc.data().uid, "current");
            const text = targets.length
              ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
              : "No current targets.";
            reply = `🎯 *Current Targets:*\n\n${text}`;
          }
        } else if (/^\/upcoming$/i.test(text)) {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists || !userDoc.data().uid) {
            reply = "❌ Link your account first with /link <email>";
          } else {
            const targets = await fetchTargetsForUser(userDoc.data().uid, "upcoming");
            const text = targets.length
              ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
              : "No upcoming targets.";
            reply = `📅 *Upcoming Targets:*\n\n${text}`;
          }
        } else if (/^\/recurring$/i.test(text)) {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists || !userDoc.data().uid) {
            reply = "❌ Link your account first with /link <email>";
          } else {
            const targets = await fetchTargetsForUser(userDoc.data().uid, "recurring");
            const text = targets.length
              ? targets.map((t, i) => formatTargetLine(t, i)).join("\n")
              : "No recurring targets.";
            reply = `🔄 *Recurring Targets:*\n\n${text}`;
          }

        // ── Shared commands — delegate to processMessage ──

        } else if (/^\/mode/.test(text)) {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists || !userDoc.data().uid) {
            reply = "❌ Link your account first with /link <email>";
          } else {
            const uid = userDoc.data().uid;
            const tgChatPath = `chats/telegram/${uid}`;
            const tgChatRef = rtdb.ref(tgChatPath);
            const tgSnap = await tgChatRef.once("value");
            const tgData = tgSnap.val();
            const currentMode = tgData?.mode === "planner" ? "planner" : "builder";

            const modeArg = text.replace(/^\/mode\s*/i, "").trim().toLowerCase();
            if (!modeArg) {
              reply = `Current mode: ${currentMode === "planner" ? "📋 Planner" : "🔨 Builder"}\n\nSwitch with /mode planner or /mode builder`;
            } else if (modeArg === "planner" || modeArg === "builder") {
              await tgChatRef.update({mode: modeArg, updatedAt: Date.now()});
              reply = `Switched to ${modeArg === "planner" ? "📋 Planner" : "🔨 Builder"} mode.`;
            } else {
              reply = `Unknown mode "${modeArg}". Use /mode planner or /mode builder.`;
            }
          }
        } else {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists) {
            reply = "❌ You haven't linked your account yet. Use /link <email>";
          } else {
            const uid = userDoc.data().uid;
            if (!uid) {
              reply = "❌ Your account is pending verification. Try again later.";
            } else {
              const result = await processMessage(uid, text, {context: "telegram"});
              reply = result.reply;
            }
          }
        }

        // Send reply via Telegram API
        await sendTelegramMessage(chatId, reply, token, "Markdown");
      } catch (err) {
        logger.error("Error handling Telegram update", err);
      }

      // Always return 200 OK to Telegram (they'll retry on non-200)
      res.status(200).send("OK");
    },
);

// ── Callable: chatWithLLM (used by the ChatPanel component) ──

exports.chatWithLLM = onCall(
    {maxInstances: 10, region: "asia-southeast1", timeoutSeconds: 300},
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        return {reply: "Authentication required. Please sign in.", model: "opencode/big-pickle", systemMessage: null, messages: []};
      }

      const {text, mode} = request.data;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return {reply: "No message provided.", model: "opencode/big-pickle", systemMessage: null, messages: []};
      }

      logger.info(`chatWithLLM called by user ${uid} (mode: ${mode || "builder"})`);
      return await processMessage(uid, text, {context: "web", mode});
    },
);

// ── Debug: getPromptTemplate (emulator only) ──

exports.debugGetPromptTemplate = onRequest(
    {region: "asia-southeast1"},
    async (req, res) => {
      const host = req.headers.host || "";
      if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
        res.status(403).json({error: "Emulator only"});
        return;
      }

      const command = req.query.command;
      if (!command) {
        res.status(400).json({error: "Missing ?command= parameter"});
        return;
      }

      const snap = await rtdb.ref(`prompts/${command}`).once("value");
      const template = snap.val();
      if (!template) {
        res.status(404).json({error: `No template found at prompts/${command}`});
        return;
      }

      res.json({command, template});
    },
);

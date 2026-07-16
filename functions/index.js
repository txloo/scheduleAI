const {onCall, onRequest} = require("firebase-functions/https");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Load .env for local emulator; no-op in production
try {
  require("dotenv").config();
} catch (_) { /* no-op in production */ }

admin.initializeApp();
const db = admin.firestore();

const DAYS_OF_WEEK = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

// ── Secrets (declared for Firebase Functions; fall back to process.env for emulator) ──
const telegramBotToken = defineString("TELEGRAM_BOT_TOKEN");
// eslint-disable-next-line no-unused-vars
const llmApiKey = defineString("LLM_API_KEY");
// eslint-disable-next-line no-unused-vars
const llmProvider = defineString("LLM_PROVIDER");
// eslint-disable-next-line no-unused-vars
const llmModel = defineString("LLM_MODEL");

// ── Helpers ──

function getWeekDays(weekOf) {
  const monday = new Date(weekOf + "T00:00:00");
  return DAYS_OF_WEEK.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {day, date: d.toISOString().split("T")[0]};
  });
}

/**
 * Rule-based scheduler: slots goals into free time between events.
 * Replace with an LLM call when AI provider is configured.
 */
// eslint-disable-next-line no-unused-vars
function scheduleGoals(events, goals, weekDays, mainGoals = []) {
  // mainGoals are available for context (used in future LLM-based scheduling)
  // Current rule-based scheduler ignores mainGoals
  const slots = [];
  const sortedGoals = [...goals].sort((a, b) => b.priority - a.priority);

  for (const goal of sortedGoals) {
    let hoursRemaining = goal.estimatedHours;

    for (const {day, date} of weekDays) {
      if (hoursRemaining <= 0) break;

      const dayStart = "09:00";
      const dayEnd = "18:00";

      const dayEvents = events
          .filter((e) => e.date === date)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

      let freeSlots = [{start: dayStart, end: dayEnd}];
      for (const ev of dayEvents) {
        const newFree = [];
        for (const fs of freeSlots) {
          if (ev.startTime >= fs.end || ev.endTime <= fs.start) {
            newFree.push(fs);
          } else {
            if (fs.start < ev.startTime) newFree.push({start: fs.start, end: ev.startTime});
            if (fs.end > ev.endTime) newFree.push({start: ev.endTime, end: fs.end});
          }
        }
        freeSlots = newFree;
      }

      for (const fs of freeSlots) {
        if (hoursRemaining <= 0) break;

        const [sh, sm] = fs.start.split(":").map(Number);
        const [eh, em] = fs.end.split(":").map(Number);
        const slotHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        if (slotHours <= 0) continue;

        const assignHours = Math.min(hoursRemaining, Math.min(slotHours, 3));
        const assignMinutes = Math.round(assignHours * 60);
        const startMinutes = sh * 60 + sm;
        const endMinutes = startMinutes + assignMinutes;

        const pad = (n) => String(n).padStart(2, "0");
        slots.push({
          day,
          date,
          startTime: `${pad(Math.floor(startMinutes / 60))}:${pad(startMinutes % 60)}`,
          endTime: `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`,
          goalId: goal.id || "",
          goalText: goal.text,
        });

        hoursRemaining -= assignHours;
      }
    }
  }
  return slots;
}

/**
 * Fetches events + goals for a user/week and returns a planned schedule.
 */
async function buildPlan(uid, weekOf) {
  const eventsSnap = await db
      .collection("events")
      .where("userId", "==", uid)
      .where("date", ">=", weekOf)
      .get();
  const events = [];
  eventsSnap.forEach((doc) => {
    const d = doc.data();
    events.push({id: doc.id, title: d.title, date: d.date, startTime: d.startTime, endTime: d.endTime});
  });

  const goalsSnap = await db
      .collection("goals")
      .where("userId", "==", uid)
      .where("weekOf", "==", weekOf)
      .get();
  const goals = [];
  goalsSnap.forEach((doc) => {
    const d = doc.data();
    goals.push({id: doc.id, text: d.text, priority: d.priority, estimatedHours: d.estimatedHours, deadline: d.deadline});
  });

  const mainGoalsSnap = await db
      .collection("mainGoals")
      .where("userId", "==", uid)
      .get();
  const mainGoals = [];
  mainGoalsSnap.forEach((doc) => {
    const d = doc.data();
    mainGoals.push({
      id: doc.id,
      title: d.title,
      description: d.description,
      targetDate: d.targetDate,
      status: d.status,
    });
  });

  const weekDays = getWeekDays(weekOf);

  // TODO: Replace with LLM call when AI provider is configured.
  // Read provider from process.env / secrets:
  //   const provider = (llmApiKey.value() || process.env.LLM_API_KEY)
  //                   ? (process.env.LLM_PROVIDER || "openai") : null;
  //   if (provider) { ... call LLM ... }

  return scheduleGoals(events, goals, weekDays, mainGoals);
}

// ── Callable: testConnection (smoke test for emulator CORS) ──

exports.testConnection = onCall(
    {region: "asia-southeast1"},
    async (request) => {
      logger.info(`testConnection called by ${request.auth?.uid || "anonymous"}`);
      return {ok: true, timestamp: new Date().toISOString()};
    },
);

// ── Callable: generateWeeklyPlan (used by the web app) ──

exports.generateWeeklyPlan = onCall(
    {maxInstances: 10, secrets: ["LLM_API_KEY", "LLM_PROVIDER", "LLM_MODEL"], region: "asia-southeast1"},
    async (request) => {
      const {weekOf} = request.data;
      const uid = request.auth?.uid;

      if (!uid) throw new Error("User must be authenticated.");
      if (!weekOf) throw new Error("weekOf is required.");

      logger.info(`Generating plan for user ${uid}, week ${weekOf}`);

      const slots = await buildPlan(uid, weekOf);

      logger.info(`Generated ${slots.length} slots for week ${weekOf}`);
      return {slots};
    },
);

// ── Tool definitions for LLM function calling ──

const TOOLS = [
  {
    type: "function",
    function: {
      name: "createMainGoal",
      description: "Create a new main goal (long-term goal) for the user",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the main goal" },
          description: { type: "string", description: "Detailed description of the goal" },
          targetDate: { type: "string", description: "Target completion date (ISO format, e.g. 2026-12-31)" },
          status: { type: "string", enum: ["active", "completed", "cancelled"], description: "Status of the goal" },
        },
        required: ["title", "description", "targetDate", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createWeeklyGoal",
      description: "Create a new weekly goal for the current or specified week",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Description of the weekly goal" },
          priority: { type: "number", description: "Priority level 1-5 (1=lowest, 5=highest)" },
          estimatedHours: { type: "number", description: "Estimated hours needed" },
          weekOf: { type: "string", description: "ISO Monday date of the week (e.g. 2026-07-06)" },
          mainGoalId: { type: "string", description: "Optional ID of an associated main goal" },
        },
        required: ["text", "priority", "estimatedHours", "weekOf"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateSchedule",
      description: "Generate a weekly schedule by fitting goals into free time between events",
      parameters: {
        type: "object",
        properties: {
          weekOf: { type: "string", description: "ISO Monday date of the week (e.g. 2026-07-06)" },
          method: {
            type: "string",
            enum: ["llm", "rule"],
            description: "Scheduling method: 'rule' uses the deterministic scheduler, 'llm' lets the AI generate the schedule intelligently",
          },
        },
        required: ["weekOf"],
      },
    },
  },
];

/**
 * Handles an LLM tool call by routing to the appropriate handler.
 * @param {Object} toolCall - The tool call object { id, type, function: { name, arguments } }
 * @param {string} uid - The authenticated user's UID
 * @returns {Promise<{toolCallId: string, result: Object}>}
 */
async function handleToolCall(toolCall, uid) {
  const {id, function: {name, arguments: argsJson}} = toolCall;
  const args = JSON.parse(argsJson);

  switch (name) {
    case "createMainGoal": {
      const docRef = await db.collection("mainGoals").add({
        title: args.title,
        description: args.description,
        targetDate: args.targetDate,
        status: args.status,
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        toolCallId: id,
        result: {success: true, id: docRef.id, summary: `Created main goal "${args.title}"`},
      };
    }

    case "createWeeklyGoal": {
      const goalData = {
        text: args.text,
        priority: args.priority,
        estimatedHours: args.estimatedHours,
        weekOf: args.weekOf,
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (args.mainGoalId) goalData.mainGoalId = args.mainGoalId;
      const docRef = await db.collection("goals").add(goalData);
      return {
        toolCallId: id,
        result: {success: true, id: docRef.id, summary: `Created weekly goal "${args.text}"`},
      };
    }

    case "generateSchedule": {
      const method = args.method || "rule";
      if (method === "rule") {
        const slots = await buildPlan(uid, args.weekOf);
        return {
          toolCallId: id,
          result: {success: true, method: "rule", slots, summary: `Generated schedule with ${slots.length} time slots`},
        };
      }
      // method === "llm": fetch user data and return for LLM to schedule
      const eventsSnap = await db.collection("events").where("userId", "==", uid).where("date", ">=", args.weekOf).get();
      const events = [];
      eventsSnap.forEach((doc) => {
        const d = doc.data();
        events.push({id: doc.id, title: d.title, date: d.date, startTime: d.startTime, endTime: d.endTime});
      });

      const goalsSnap = await db.collection("goals").where("userId", "==", uid).where("weekOf", "==", args.weekOf).get();
      const goals = [];
      goalsSnap.forEach((doc) => {
        const d = doc.data();
        goals.push({id: doc.id, text: d.text, priority: d.priority, estimatedHours: d.estimatedHours});
      });

      const mainGoalsSnap = await db.collection("mainGoals").where("userId", "==", uid).get();
      const mainGoals = [];
      mainGoalsSnap.forEach((doc) => {
        const d = doc.data();
        mainGoals.push({id: doc.id, title: d.title, description: d.description, targetDate: d.targetDate, status: d.status});
      });

      const weekDays = getWeekDays(args.weekOf);

      return {
        toolCallId: id,
        result: {
          success: true,
          method: "llm",
          events,
          goals,
          mainGoals,
          weekDays,
          summary: `Fetched ${events.length} events, ${goals.length} goals, and ${mainGoals.length} main goals for ${args.weekOf}`,
        },
      };
    }

    default:
      return {
        toolCallId: id,
        result: {success: false, error: `Unknown tool: ${name}`},
      };
  }
}

// ── Helper: get the ISO date string for the current week's Monday ──

function getCurrentWeekMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split("T")[0];
}

// ── HTTP: telegramWebhook (called by Telegram when users message the bot) ──
//
// Setup: After deploying, run:
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://asia-southeast1-scheduleai-df477.cloudfunctions.net/telegramWebhook"
//
// Then Telegram will POST updates to this endpoint whenever users message the bot.

exports.telegramWebhook = onRequest(
    {maxInstances: 10, secrets: ["TELEGRAM_BOT_TOKEN", "LLM_API_KEY", "LLM_PROVIDER", "LLM_MODEL"], region: "asia-southeast1"},
    async (req, res) => {
    // Only accept POST
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const token = telegramBotToken.value() || process.env.TELEGRAM_BOT_TOKEN;
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

      try {
        let reply;

        if (/^\/start/.test(text)) {
          reply = "👋 Welcome to Schedule AI!\n\n" +
          "I can help you plan your week. First, link your account:\n" +
          "Send me your Firebase email to get started.\n\n" +
          "Commands:\n" +
          "/week - Show this week's plan\n" +
          "/plan <goals> - Generate a plan from goals\n" +
          "/link <email> - Link your Telegram to Firebase";
        } else if (/^\/link\s+/i.test(text)) {
          const email = text.replace(/^\/link\s+/i, "").trim();
          // Store mapping: telegramUsers/{fromId} -> { email, uid: null (until verified) }
          await db.collection("telegramUsers").doc(String(fromId)).set({
            email,
            chatId,
            linkedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          reply = `✅ Linked to ${email}. You can now manage your schedule via Telegram!`;
        } else if (/^\/week$/.test(text)) {
        // Look up the user
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists) {
            reply = "❌ You haven't linked your account yet. Use /link <email>";
          } else {
            const uid = userDoc.data().uid;
            if (!uid) {
              reply = "❌ Your account is pending verification. Try again later.";
            } else {
              // Find the Monday of current week
              const d = new Date();
              const day = d.getDay();
              const diff = d.getDate() - day + (day === 0 ? -6 : 1);
              const monday = new Date(d.setDate(diff));
              const weekStart = monday.toISOString().split("T")[0];
              const slots = await buildPlan(uid, weekStart);

              if (slots.length === 0) {
                reply = "📅 No plan yet this week. Add some goals and events first!";
              } else {
                reply = "📅 *This Week's Plan*\n\n";
                const byDay = {};
                for (const s of slots) {
                  if (!byDay[s.day]) byDay[s.day] = [];
                  byDay[s.day].push(s);
                }
                for (const day of DAYS_OF_WEEK) {
                  if (!byDay[day]) continue;
                  reply += `*${day}*\n`;
                  for (const s of byDay[day]) {
                    reply += `  ${s.startTime}–${s.endTime}  ${s.goalText}\n`;
                  }
                  reply += "\n";
                }
              }
            }
          }
        } else if (/^\/plan\s+/i.test(text)) {
          const userDoc = await db.collection("telegramUsers").doc(String(fromId)).get();
          if (!userDoc.exists) {
            reply = "❌ You haven't linked your account yet. Use /link <email>";
          } else {
            const uid = userDoc.data().uid;
            if (!uid) {
              reply = "❌ Your account is pending verification. Try again later.";
            } else {
              const goalsText = text.replace(/^\/plan\s+/i, "").trim();

              const apiKey = llmApiKey.value() || process.env.LLM_API_KEY;
              if (!apiKey) {
                reply = "❌ LLM is not configured.";
              } else {
                try {
                  const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                      model: "big-pickle",
                      messages: [
                        {
                          role: "system",
                          content: "You are a planning assistant for Schedule AI. When a user describes their goals for the week, you should:\n" +
                            "1. Create a weekly goal for each distinct goal using the createWeeklyGoal tool\n" +
                            "2. Then call generateSchedule with method='rule' to create a schedule\n" +
                            "First, figure out the current week's Monday (ISO date) and use it as weekOf.\n" +
                            "Report back what goals were created and show the schedule.",
                        },
                        {
                          role: "user",
                          content: `User's goals: ${goalsText}\n\nCurrent week Monday: ${getCurrentWeekMonday()}`,
                        },
                      ],
                      tools: TOOLS,
                      tool_choice: "auto",
                    }),
                  });

                  if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`Telegram /plan LLM error: ${response.status} ${errorText}`);
                    reply = "❌ Sorry, the AI service is unavailable. Please try again later.";
                  } else {
                    const data = await response.json();
                    const choice = data.choices?.[0]?.message;

                    if (choice?.tool_calls && choice.tool_calls.length > 0) {
                      // Execute tools
                      const toolResults = [];
                      for (const toolCall of choice.tool_calls) {
                        const result = await handleToolCall(toolCall, uid);
                        toolResults.push(result);
                      }

                      // Get final response from LLM
                      const followUpResponse = await fetch("https://opencode.ai/zen/v1/chat/completions", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                          model: "big-pickle",
                          messages: [
                            {
                              role: "system",
                              content: "You are a planning assistant for Schedule AI.",
                            },
                            ...(toolResults.map((tr) => ({
                              role: "tool",
                              tool_call_id: tr.toolCallId,
                              content: JSON.stringify(tr.result),
                            }))),
                            {
                              role: "user",
                              content: "Summarize what was created and show me the schedule.",
                            },
                          ],
                        }),
                      });

                      if (followUpResponse.ok) {
                        const followUpData = await followUpResponse.json();
                        reply = followUpData.choices?.[0]?.message?.content || "✅ Plan generated!";
                      } else {
                        reply = "✅ Goals created and plan generated! Check your dashboard for details.";
                      }
                    } else {
                      reply = choice?.content || "✅ Plan generated!";
                    }
                  }
                } catch (err) {
                  logger.error("Telegram /plan error", err);
                  reply = "❌ Sorry, something went wrong while generating your plan.";
                }
              }
            }
          }
        } else {
        // Default: show available commands
          reply = "Commands:\n" +
          "/link <email> - Link Telegram to your account\n" +
          "/week - Show this week's schedule\n" +
          "/plan <goals> - Quick plan from text\n" +
          "/start - Show this help";
        }

        // Send reply via Telegram API
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            chat_id: chatId,
            text: reply,
            parse_mode: "Markdown",
          }),
        });
      } catch (err) {
        logger.error("Error handling Telegram update", err);
      }

      // Always return 200 OK to Telegram (they'll retry on non-200)
      res.status(200).send("OK");
    },
);

// ── Hello World (for testing) ──

exports.helloWorld = onRequest(
    {region: "asia-southeast1"},
    async (request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

// ── Callable: chatWithLLM (used by the ChatPanel component) ──

exports.chatWithLLM = onCall(
    {maxInstances: 10, secrets: ["LLM_API_KEY"], region: "asia-southeast1"},
    async (request) => {
      const {messages} = request.data;
      const uid = request.auth?.uid;

      if (!uid) {
        return {reply: "Authentication required. Please sign in.", model: "opencode/big-pickle"};
      }
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return {reply: "No messages provided.", model: "opencode/big-pickle"};
      }

      const apiKey = llmApiKey.value() || process.env.LLM_API_KEY;
      if (!apiKey) {
        logger.error("LLM_API_KEY not configured");
        return {reply: "LLM is not configured. Please set up the API key.", model: "opencode/big-pickle"};
      }

      logger.info(`chatWithLLM called by user ${uid}, ${messages.length} messages`);

      try {
        // Add system message about available tools if not present
        const enhancedMessages = [...messages];

        const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "big-pickle",
            messages: enhancedMessages,
            tools: TOOLS,
            tool_choice: "auto",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`OpenCode Zen API error: ${response.status} ${errorText}`);
          return {
            reply: `Sorry, the AI service returned an error (${response.status}). Please try again later.`,
            model: "opencode/big-pickle",
          };
        }

        const data = await response.json();
        const choice = data.choices?.[0]?.message;

        // Check if the LLM wants to call tools
        if (choice?.tool_calls && choice.tool_calls.length > 0) {
          // Execute all tool calls
          const toolResults = [];
          for (const toolCall of choice.tool_calls) {
            const result = await handleToolCall(toolCall, uid);
            toolResults.push(result);
          }

          // Send tool results back to the LLM for a final response
          const followUpMessages = [
            ...enhancedMessages,
            choice,
            ...toolResults.map((tr) => ({
              role: "tool",
              tool_call_id: tr.toolCallId,
              content: JSON.stringify(tr.result),
            })),
          ];

          const followUpResponse = await fetch("https://opencode.ai/zen/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "big-pickle",
              messages: followUpMessages,
            }),
          });

          if (!followUpResponse.ok) {
            const errorText = await followUpResponse.text();
            logger.error(`OpenCode Zen API follow-up error: ${followUpResponse.status} ${errorText}`);
            // Fall back: return a summary of what was done
            const summaries = toolResults.map((tr) => tr.result.summary || JSON.stringify(tr.result)).join("\n");
            return {reply: `I've completed the following actions:\n${summaries}`, model: "opencode/big-pickle"};
          }

          const followUpData = await followUpResponse.json();
          const followUpReply = followUpData.choices?.[0]?.message?.content || "Actions completed.";
          return {reply: followUpReply, model: "opencode/big-pickle"};
        }

        // No tool calls — return the LLM's text response as before
        const reply = choice?.content || "No response from AI.";
        logger.info(`chatWithLLM success for user ${uid}`);
        return {reply, model: "opencode/big-pickle"};
      } catch (err) {
        logger.error("chatWithLLM fetch error", err);
        return {
          reply: "Sorry, an error occurred while contacting the AI service. Please check your network and try again.",
          model: "opencode/big-pickle",
        };
      }
    },
);

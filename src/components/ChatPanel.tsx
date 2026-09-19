import { useState, useRef, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { rtdb, functions } from "../lib/firebase";
import { ref, onValue, update } from "firebase/database";

interface ChatPanelProps {
  userId: string;
  onClose?: () => void;
  onToolAction?: (toolNames: string[]) => void;
}

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "👋 Hi! I'm your Schedule AI assistant. I can help you plan your week, answer questions about scheduling, or just chat. What can I help you with?",
};

const COMMANDS = [
  { command: "/plan", description: "Generate a weekly plan" },
  { command: "/tplan", description: "Generate new targets for the week" },
  { command: "/week", description: "Show current week date range" },
  { command: "/current", description: "Show current targets" },
  { command: "/upcoming", description: "Show upcoming targets" },
  { command: "/recurring", description: "Show recurring targets" },
  { command: "/goals", description: "Show your current main goals" },
  { command: "/targets", description: "Show your current targets" },
  { command: "/events", description: "Show upcoming events" },
  { command: "/archive", description: "Archive current targets, past events, completed goals" },
  { command: "/model-<model-id>", description: "Switch AI model (e.g. /model-z-ai/glm-5.2:free)" },
  { command: "/tool", description: "Toggle tool protocol (native vs text)" },
  { command: "/settings", description: "Show current model and mode" },
  { command: "/help", description: "Show all available commands" },
  { command: "/clear", description: "Reset chat history" },
];

const HELP_TEXT = COMMANDS.map((c) => `${c.command} — ${c.description}`).join("\n");

const DEFAULT_MESSAGES: { role: string; content: string }[] = [
  WELCOME_MESSAGE,
];

function getToolNamesFromStepBubbles(messages: { role: string; content: string }[]): string[] {
  const names = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const line of String(m.content).split("\n")) {
      const match = /🔧\s+([A-Za-z0-9_]+)/.exec(line);
      if (match) names.add(match[1]);
    }
  }
  return [...names];
}

type AiMode = "planner" | "builder";
type AiToolMode = "native" | "text";

const DEFAULT_LABEL = "openrouter/z-ai/glm-5.2:free";

export default function ChatPanel({ userId, onClose, onToolAction }: ChatPanelProps) {
  const [mode, setMode] = useState<AiMode>("planner");
  const [toolProtocol, setToolProtocol] = useState<AiToolMode>("text");
  const [activeModel, setActiveModel] = useState<string>(DEFAULT_LABEL);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(
    DEFAULT_MESSAGES
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const historyIndex = useRef(-1);
  const prevStreamingRef = useRef<boolean | null>(null);

  useEffect(() => {
    const chatRef = ref(rtdb, `chats/${userId}`);
    const unsubscribe = onValue(chatRef, (snap) => {
      const data = snap.val();
      const streaming = !!data?.streaming;
      if (!streaming && prevStreamingRef.current === true && data?.messages) {
        const toolNames = getToolNamesFromStepBubbles(data.messages);
        if (toolNames.length > 0) onToolAction?.(toolNames);
      }
      prevStreamingRef.current = streaming;
      if (data && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages(DEFAULT_MESSAGES);
      }
      if (data?.model) setActiveModel(`openrouter/${data.model}`);
      setLoading(streaming);
    });
    return unsubscribe;
  }, [userId]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearTop = el.scrollTop < 100;
    setShowScrollButton(!nearTop);
  };

  const scrollToTop = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setShowScrollButton(false);
  };

  // Newest messages render at the top: autoscroll to top on new messages,
  // but stop if the user has scrolled down reading older ones.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 100) {
      el.scrollTop = 0;
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;

    if (/^\/help$/i.test(trimmedInput)) {
      setInput("");
      setTransientMessage(HELP_TEXT);
      return;
    }

    const modelCmd = /^\/model(?:-(.*))?$/i.exec(trimmedInput);
    if (modelCmd) {
      setInput("");
      historyIndex.current = -1;
      const newModel = modelCmd[1] ? modelCmd[1].trim() : "";
      setTransientMessage(
        newModel
          ? `Model set to "${newModel}".`
          : `Current model: ${activeModel}. Type /model-<model-id> to switch.`
      );
      try {
        const chatWithLLM = httpsCallable(functions, "chatWithLLM");
        chatWithLLM({ text: trimmedInput, mode, toolProtocol }).catch((err) => {
          console.error("[chatWithLLM] model switch failed (UI updates via RTDB):", err);
        });
      } catch (err) {
        console.error("[chatWithLLM] model switch setup failed:", err);
      }
      return;
    }

    if (/^\/tool$/i.test(trimmedInput)) {
      setInput("");
      const next = toolProtocol === "text" ? "native" : "text";
      setToolProtocol(next);
      setTransientMessage(
        `Tool protocol switched to "${next}".\n\n${next === "text"
          ? "Provider workaround: native tools param is omitted; the model emits a fenced-JSON tool-call block that is parsed + executed backend-side."
          : "Native: registered-API tools + tool_choice: auto; tool calls are executed backend-side."}`
      );
      return;
    }

    if (/^\/settings$/i.test(trimmedInput)) {
      setInput("");
      setTransientMessage(
        `Settings\n• AI model: ${activeModel}\n• Chat mode: ${mode === "planner" ? "📋 Planner" : "🔨 Builder"}`
      );
      return;
    }

    const userMessage = { role: "user", content: trimmedInput };
    setMessages((prev) => [...prev, userMessage]);
    setTransientMessage(null);
    setInput("");
    historyIndex.current = -1;
    setLoading(true);

    // Fire-and-forget: the chat UI updates live via the RTDB listener.
    // Local loading state follows the server's `streaming` flag in RTDB.
    try {
      const chatWithLLM = httpsCallable(functions, "chatWithLLM");
      chatWithLLM({ text: trimmedInput, mode, toolProtocol }).catch((err) => {
        console.error("[chatWithLLM] request failed (UI updates via RTDB):", err);
      });
    } catch (err) {
      console.error("[chatWithLLM] call setup failed:", err);
    }
  };

  const handleStopStreaming = async () => {
    setLoading(false);
    try {
      await update(ref(rtdb, `chats/${userId}`), { streaming: false });
    } catch (err) {
      console.error("Failed to unblock chat:", err);
    }
  };

  const handleTestConnection = async () => {
    try {
      const testFn = httpsCallable(functions, "testConnection");
      const result = await testFn({});
      console.log("[testConnection] OK:", result.data);
      alert("Connection OK: " + JSON.stringify(result.data));
    } catch (err) {
      console.error("[testConnection] FAILED:", err);
      alert("Connection FAILED — check console");
    }
  };

  const handleCopy = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
      return;
    }

    const userMessages = messages.filter((m) => m.role === "user");

    if (e.key === "ArrowUp") {
      if (userMessages.length === 0) return;
      e.preventDefault();
      if (historyIndex.current === -1) {
        historyIndex.current = userMessages.length - 1;
      } else if (historyIndex.current > 0) {
        historyIndex.current--;
      }
      setInput(userMessages[historyIndex.current].content);
    } else if (e.key === "ArrowDown") {
      if (historyIndex.current === -1) return;
      e.preventDefault();
      historyIndex.current++;
      if (historyIndex.current >= userMessages.length) {
        historyIndex.current = -1;
        setInput("");
      } else {
        setInput(userMessages[historyIndex.current].content);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">AI Chat</h3>
          <div className="flex items-center gap-2">
            {messages.length > 1 ? (
              <button
                onClick={handleStopStreaming}
                className="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600"
                title="Clears a stuck streaming state so you can send again"
              >
                ⏹ Unblock
              </button>
            ) : (
              <button
                onClick={handleTestConnection}
                className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
              >
                Test Connection
              </button>
            )}
            <span className="text-xs text-gray-400">{activeModel}</span>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-1 text-gray-400 hover:text-gray-700 transition"
                title="Close chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Mode toggle */}
        <div className="mt-2 flex items-center gap-2">
          <div className="inline-flex rounded-full border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => setMode("planner")}
              className={`px-3 py-1 transition ${mode === "planner" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              📋 Planner
            </button>
            <button
              onClick={() => setMode("builder")}
              className={`px-3 py-1 transition ${mode === "builder" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              🔨 Builder
            </button>
          </div>
          <div className="inline-flex rounded-full border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => setToolProtocol("native")}
              className={`px-3 py-1 transition ${toolProtocol === "native" ? "bg-purple-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              🧰 Native
            </button>
            <button
              onClick={() => setToolProtocol("text")}
              className={`px-3 py-1 transition ${toolProtocol === "text" ? "bg-purple-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              🔧 Text
            </button>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
        {/* Loading indicator (new content streams in at the top) */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-gray-500 text-sm animate-pulse">
              thinking...
            </div>
          </div>
        )}

        {/* Newest messages at the top, oldest pushed down */}
        {[...messages].reverse().map((msg, idx) => {
          if (msg.role === "system") {
            return null;
          }
          const origIdx = messages.length - 1 - idx;
          const isUser = msg.role === "user";
          return (
            <div
              key={origIdx}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                onClick={() => handleCopy(origIdx, msg.content)}
                className={`max-w-[75%] rounded-lg px-3 py-2 cursor-pointer select-none ${
                  isUser
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {copiedIdx === origIdx && (
                  <div className={`text-xs mt-1 ${isUser ? "text-blue-200" : "text-gray-400"}`}>
                    Copied!
                  </div>
                )}
                {!isUser && (
                  <div className="text-xs text-gray-400 mt-1">
                    🤖 openrouter/z-ai/glm-5.2:free
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Command chips (shown when only the welcome message exists) */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {COMMANDS.filter((c) => c.command !== "/clear").map((c) => (
              <button
                key={c.command}
                onClick={() => setInput(c.command)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full px-3 py-1.5 transition"
              >
                {c.command}
              </button>
            ))}
          </div>
        )}

        {/* Transient message (e.g. /help output) */}
        {transientMessage && (
          <div className="flex justify-center">
            <div className="max-w-[90%] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <div className="whitespace-pre-wrap">{transientMessage}</div>
            </div>
          </div>
        )}

        {showScrollButton && (
          <button
            onClick={scrollToTop}
            className="sticky top-0 left-1/2 -translate-x-1/2 bg-gray-800 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-gray-700 transition text-sm mx-auto"
          >
            ↑
          </button>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t px-4 py-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); historyIndex.current = -1; }}
          onKeyDown={handleKeyDown}
          placeholder={mode === "planner" ? "What do you want to plan?" : "What should I create or update?"}
          disabled={loading}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}

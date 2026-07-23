import { useState, useRef, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { rtdb, functions } from "../lib/firebase";
import { ref, set, get } from "firebase/database";

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
  { command: "/goals", description: "Show your current main goals" },
  { command: "/targets", description: "Show your current targets" },
  { command: "/events", description: "Show upcoming events" },
  { command: "/help", description: "Show all available commands" },
  { command: "/clear", description: "Reset chat history" },
];

const HELP_TEXT = COMMANDS.map((c) => `${c.command} — ${c.description}`).join("\n");

const DEFAULT_MESSAGES: { role: string; content: string }[] = [
  WELCOME_MESSAGE,
];

export default function ChatPanel({ userId, onClose, onToolAction }: ChatPanelProps) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(
    DEFAULT_MESSAGES
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    async function fetchMessages() {
      const chatRef = ref(rtdb, `chats/${userId}`);
      const snap = await get(chatRef);
      if (snap.exists()) {
        const data = snap.val();
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      }
      setLoading(false);
    }
    fetchMessages();
  }, [userId]);

  // Auto-scroll to bottom on new messages (skip initial render)
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;

    if (/^\/clear$/i.test(trimmedInput)) {
      setInput("");
      setTransientMessage(null);
      setMessages([WELCOME_MESSAGE]);
      await set(ref(rtdb, `chats/${userId}`), {
        messages: [WELCOME_MESSAGE],
        updatedAt: Date.now(),
      });
      return;
    }

    if (/^\/help$/i.test(trimmedInput)) {
      setInput("");
      setTransientMessage(HELP_TEXT);
      return;
    }

    const userMessage = { role: "user", content: trimmedInput };
    const promptMessages = messages.filter((message) => message.role !== "system");
    const updatedPromptMessages = [...promptMessages, userMessage];
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setTransientMessage(null);
    setInput("");
    setLoading(true);

    try {
      const chatWithLLM = httpsCallable(functions, "chatWithLLM");
      const result = await chatWithLLM({ messages: updatedPromptMessages });
      const { reply, systemMessage, steps } = result.data as { reply: string; model: string; systemMessage?: string | null; steps?: { tool: string }[] };

      const stepMessages = steps && steps.length > 0
        ? [{ role: "assistant", content: steps.map((s) => s.tool).join("\n") }]
        : [];
      const assistantMessage = { role: "assistant", content: reply };
      const lastSystemMessage = [...updatedMessages].reverse().find((message) => message.role === "system")?.content;
      const nextMessages = systemMessage && systemMessage !== lastSystemMessage
        ? [...updatedMessages, ...stepMessages, { role: "system", content: systemMessage }, assistantMessage]
        : [...updatedMessages, ...stepMessages, assistantMessage];

      // Sliding window: keep the welcome message + the most recent 30 entries
      const finalMessages = nextMessages.length > 31
        ? [nextMessages[0], ...nextMessages.slice(-30)]
        : nextMessages;

      // Persist to RTDB
      await set(ref(rtdb, `chats/${userId}`), {
        messages: finalMessages,
        updatedAt: Date.now(),
      });

      setMessages(finalMessages);
      if (steps && steps.length > 0) {
        const toolNames = steps.map((s) => s.tool.split(":")[0].trim());
        onToolAction?.(toolNames);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-bold text-lg">AI Chat</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
          >
            Test Connection
          </button>
          <span className="text-xs text-gray-400">opencode/big-pickle</span>
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => {
          if (msg.role === "system") {
            return null;
          }
          const isUser = msg.role === "user";
          return (
            <div
              key={idx}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                  isUser
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {!isUser && (
                  <div className="text-xs text-gray-400 mt-1">
                    🤖 opencode/big-pickle
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

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-gray-500 text-sm animate-pulse">
              thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t px-4 py-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
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

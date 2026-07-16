import { useState, useRef, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { rtdb, functions } from "../lib/firebase";
import { ref, get, set } from "firebase/database";

interface ChatPanelProps {
  userId: string;
}

const DEFAULT_MESSAGES: { role: string; content: string }[] = [
  { role: "system", content: "You are a helpful assistant integrated into Schedule AI, a weekly planning app." },
  { role: "assistant", content: "👋 Hi! I'm your Schedule AI assistant. I can help you plan your week, answer questions about scheduling, or just chat. What can I help you with?" },
];

export default function ChatPanel({ userId }: ChatPanelProps) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(DEFAULT_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat from RTDB on mount
  useEffect(() => {
    async function loadChat() {
      const chatRef = ref(rtdb, `chats/${userId}`);
      const snap = await get(chatRef);
      if (snap.exists()) {
        const data = snap.val();
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      }
      // If no data exists, keep DEFAULT_MESSAGES
    }
    loadChat();
  }, [userId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const chatWithLLM = httpsCallable(functions, "chatWithLLM");
      const result = await chatWithLLM({ messages: updatedMessages });
      const { reply, model } = result.data as { reply: string; model: string };

      const assistantMessage = { role: "assistant", content: `${reply}\n\n— 🤖 ${model}` };

      // Sliding window: keep system message (index 0) + last 20 messages (10 pairs)
      const newMessages = [...updatedMessages, assistantMessage];
      const systemMessage = newMessages[0];
      const rest = newMessages.slice(1);
      const last20 = rest.slice(-20);
      const finalMessages = [systemMessage, ...last20];

      // Persist to RTDB
      await set(ref(rtdb, `chats/${userId}`), {
        messages: finalMessages,
        updatedAt: Date.now(),
      });

      setMessages(finalMessages);
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
    <div className="border rounded-lg bg-white shadow flex flex-col">
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
        </div>
      </div>

      {/* Messages area */}
      <div className="max-h-96 overflow-y-auto p-4 space-y-3 flex-1">
        {messages.map((msg, idx) => {
          if (msg.role === "system") return null; // Don't render system message
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

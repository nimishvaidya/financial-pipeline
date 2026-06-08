import { useState, useRef, useEffect, useCallback } from "react";

function ChatDrawer({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [model, setModel] = useState("llama3.2");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check Ollama status on open
  useEffect(() => {
    if (open) {
      fetch("/api/chat/status")
        .then((r) => r.json())
        .then(setOllamaStatus)
        .catch(() => setOllamaStatus({ running: false, models: [] }));
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set model from available models
  useEffect(() => {
    if (ollamaStatus?.models?.length) {
      // Prefer llama3.2, fall back to first available
      const preferred = ["llama3.2:latest", "llama3.2", "llama3.1", "mistral", "gemma2"];
      const found = preferred.find((p) => ollamaStatus.models.some((m) => m.includes(p)));
      if (found) {
        const match = ollamaStatus.models.find((m) => m.includes(found));
        setModel(match || ollamaStatus.models[0]);
      } else {
        setModel(ollamaStatus.models[0]);
      }
    }
  }, [ollamaStatus]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Use streaming endpoint
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          model,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantIdx = newMessages.length;

      // Add placeholder
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[assistantIdx] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e.message}. Make sure Ollama is running.` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, model]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  // Suggestion chips
  const suggestions = [
    "What's my total portfolio value?",
    "How are my investments doing?",
    "Break down my monthly budget",
    "Which stocks pay the most dividends?",
    "How long until my loans are paid off?",
  ];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out"
        style={{
          width: "min(420px, 90vw)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          backgroundColor: "var(--color-bg)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: open ? "-4px 0 24px rgba(0,0,0,0.15)" : "none",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ backgroundColor: "var(--color-primary-light, rgba(59,130,246,0.1))" }}
            >
              🤖
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                Portfolio Assistant
              </h3>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: ollamaStatus?.running
                      ? "var(--color-success, #10b981)"
                      : "var(--color-danger, #ef4444)",
                  }}
                />
                <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  {ollamaStatus?.running ? model : "Ollama offline"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 rounded-lg text-xs transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                title="Clear chat"
              >
                🗑️
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Ollama not running warning */}
        {ollamaStatus && !ollamaStatus.running && (
          <div
            className="mx-4 mt-4 p-4 rounded-xl text-sm"
            style={{ backgroundColor: "var(--color-danger-light, rgba(239,68,68,0.1))", color: "var(--color-danger, #ef4444)" }}
          >
            <p className="font-semibold mb-1">Ollama is not running</p>
            <p className="text-xs opacity-80">
              Install from{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" className="underline">
                ollama.com
              </a>
              , then run:
            </p>
            <code
              className="block mt-2 px-3 py-2 rounded-lg text-xs"
              style={{ backgroundColor: "var(--color-bg-card)" }}
            >
              ollama pull llama3.2 && ollama serve
            </code>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && ollamaStatus?.running && (
            <div className="text-center pt-8">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Ask me about your finances
              </p>
              <p className="text-xs mb-6" style={{ color: "var(--color-text-muted)" }}>
                I have access to your budget, accounts, investments, and Robinhood data.
              </p>
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="block w-full text-left px-4 py-2.5 rounded-xl text-xs transition-all"
                    style={{
                      backgroundColor: "var(--color-bg-card)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-primary, #3b82f6)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-primary, #3b82f6)", animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-primary, #3b82f6)", animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-primary, #3b82f6)", animationDelay: "300ms" }} />
              </div>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          className="px-4 py-3 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="flex items-end gap-2 rounded-xl px-4 py-3"
            style={{ backgroundColor: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ollamaStatus?.running ? "Ask about your finances..." : "Ollama is not running"}
              disabled={!ollamaStatus?.running || loading}
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none text-sm"
              style={{
                color: "var(--color-text)",
                maxHeight: "120px",
                minHeight: "24px",
              }}
              onInput={(e) => {
                e.target.style.height = "24px";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || !ollamaStatus?.running}
              className="p-2 rounded-lg transition-all shrink-0"
              style={{
                backgroundColor: input.trim() && !loading ? "var(--color-primary, #3b82f6)" : "var(--color-bg-badge)",
                color: input.trim() && !loading ? "#fff" : "var(--color-text-muted)",
                opacity: input.trim() && !loading ? 1 : 0.5,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] mt-2 text-center" style={{ color: "var(--color-text-muted)" }}>
            Powered by Ollama · {model} · Your data stays local
          </p>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
        style={
          isUser
            ? {
                backgroundColor: "var(--color-primary, #3b82f6)",
                color: "#fff",
                borderBottomRightRadius: "6px",
              }
            : {
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                borderBottomLeftRadius: "6px",
              }
        }
      >
        {message.content || (
          <span className="opacity-50">...</span>
        )}
      </div>
    </div>
  );
}

export default ChatDrawer;

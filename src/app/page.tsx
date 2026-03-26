"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [agentName, setAgentName] = useState("Lightweight Agent");
  const [agentRole, setAgentRole] = useState("");
  const [agentExpertise, setAgentExpertise] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((data) => {
        if (data.name) {
          setAgentName(data.name);
          document.title = data.name;
        }
        if (data.role) setAgentRole(data.role);
        if (data.expertise) setAgentExpertise(data.expertise);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;
        const loaded: Message[] = [];
        for (const entry of data.messages) {
          const prefix = entry.userId?.startsWith("telegram:") ? "[Telegram] " : "";
          loaded.push({ role: "user", content: prefix + entry.userMessage });
          loaded.push({ role: "assistant", content: entry.assistantResponse });
        }
        setMessages(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setStatusText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stream: true }),
      });

      if (!res.body) {
        const data = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", content: data.response ?? data.error }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "status") {
              setStatusText(data.text);
            } else if (eventType === "done") {
              setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
            } else if (eventType === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Agent error." }]);
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection error." }]);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #222", flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{agentName}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
          {agentRole || "Personal AI Assistant"}
        </p>
        {agentExpertise && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#666" }}>
            {agentExpertise}
          </p>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 120, color: "#555" }}>
            <p style={{ fontSize: 40, margin: 0 }}>{agentName.charAt(0)}</p>
            <p>Send a message to get started.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 16,
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 16px",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                background: msg.role === "user" ? "#2563eb" : "#1a1a1a",
                color: msg.role === "user" ? "#fff" : "#e5e5e5",
                border: msg.role === "assistant" ? "1px solid #333" : "none",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ marginBottom: 16 }}>
            <style>{`
              @keyframes typingDot {
                0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
                40% { opacity: 1; transform: translateY(-4px); }
              }
              .typing-dots span {
                display: inline-block;
                font-size: 20px;
                line-height: 1;
                animation: typingDot 1.4s infinite ease-in-out;
              }
              .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
              .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
            `}</style>
            <div
              style={{
                display: "inline-block",
                padding: "10px 16px",
                borderRadius: 12,
                background: "#1a1a1a",
                border: "1px solid #333",
                fontSize: 14,
                color: "#888",
              }}
            >
              <span className="typing-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
              {statusText && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>
                  {statusText}
                </span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid #222", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message your agent..."
            disabled={loading}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#111",
              color: "#e5e5e5",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: loading || !input.trim() ? "#333" : "#2563eb",
              color: "#fff",
              fontSize: 14,
              cursor: loading || !input.trim() ? "default" : "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

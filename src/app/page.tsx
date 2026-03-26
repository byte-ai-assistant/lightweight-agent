"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const themes = {
  dark: {
    accent: "#33ff33",
    accentDim: "#1a8a1a",
    accentFaint: "#0d3d0d",
    bg: "#0a0a0a",
    text: "#cccccc",
    textUser: "#999999",
    dim: "#555555",
    border: "#161616",
    placeholder: "#333333",
    scrollThumb: "#222222",
    scrollHover: "#333333",
    selection: "#33ff3322",
    selectionText: "#33ff33",
    scanline: "rgba(0,0,0,0.08)",
    emptyText: "#2a2a2a",
    emptyExpertise: "#1a1a1a",
    msgCount: "#222222",
    toggleBg: "transparent",
    toggleBorder: "#222222",
    toggleColor: "#444444",
  },
  light: {
    accent: "#1a6b1a",
    accentDim: "#2d8a2d",
    accentFaint: "#d0e8d0",
    bg: "#f4f1eb",
    text: "#2a2a2a",
    textUser: "#555555",
    dim: "#999999",
    border: "#e0ddd6",
    placeholder: "#c0bdb6",
    scrollThumb: "#d0cdc6",
    scrollHover: "#b0ada6",
    selection: "#1a6b1a22",
    selectionText: "#1a6b1a",
    scanline: "rgba(0,0,0,0.02)",
    emptyText: "#d0cdc6",
    emptyExpertise: "#c0bdb6",
    msgCount: "#c0bdb6",
    toggleBg: "transparent",
    toggleBorder: "#d0cdc6",
    toggleColor: "#999999",
  },
} as const;

type Theme = keyof typeof themes;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [agentName, setAgentName] = useState("Lightweight Agent");
  const [agentRole, setAgentRole] = useState("");
  const [agentExpertise, setAgentExpertise] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = themes[theme];

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

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
          const prefix = entry.userId?.startsWith("telegram:") ? "[TG] " : "";
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
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
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
              setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "error" }]);
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "connection lost" }]);
    } finally {
      setLoading(false);
      setStatusText("");
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        * { box-sizing: border-box; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollThumb}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${t.scrollHover}; }

        ::selection { background: ${t.selection}; color: ${t.selectionText}; }

        .scanline-overlay {
          pointer-events: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            ${t.scanline} 2px,
            ${t.scanline} 4px
          );
          z-index: 1000;
        }

        .msg-line {
          animation: fadeIn 0.25s ease-out;
        }

        .input-field:focus {
          outline: none;
        }
        .input-field::placeholder {
          color: ${t.placeholder};
        }

        .send-btn:not(:disabled):hover {
          color: ${t.bg} !important;
          background: ${t.accent} !important;
        }

        .theme-toggle:hover {
          color: ${t.accent} !important;
          border-color: ${t.accent} !important;
        }

        @media (max-width: 640px) {
          .shell-pad { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>

      <div className="scanline-overlay" />

      <div style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: t.bg,
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 14,
        color: t.text,
        transition: "background 0.3s ease, color 0.3s ease",
      }}>

        {/* Header */}
        <div className="shell-pad" style={{
          padding: "16px 32px",
          flexShrink: 0,
          borderBottom: `1px solid ${t.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <span style={{ color: t.accent, fontFamily: "'Press Start 2P', monospace", fontSize: 11, letterSpacing: 1 }}>
              {agentName.toUpperCase()}
            </span>
            {agentRole && (
              <span style={{ color: t.dim, marginLeft: 16, fontSize: 13, fontFamily: "'VT323', monospace" }}>
                {agentRole}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: t.msgCount, fontSize: 12 }}>
              {messages.length > 0 && `${messages.length} msg`}
            </span>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              style={{
                padding: "4px 10px",
                borderRadius: 2,
                border: `1px solid ${t.toggleBorder}`,
                background: t.toggleBg,
                color: t.toggleColor,
                fontSize: 11,
                fontFamily: "'Share Tech Mono', monospace",
                cursor: "pointer",
                transition: "all 0.15s ease",
                letterSpacing: "0.5px",
              }}
            >
              {theme === "dark" ? "LIGHT" : "DARK"}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="shell-pad" style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 32px",
        }}>
          {messages.length === 0 && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              animation: "fadeIn 0.6s ease-out",
            }}>
              <div style={{
                fontFamily: "'VT323', monospace",
                fontSize: 28,
                color: t.accentDim,
              }}>
                {">_"}
              </div>
              <p style={{
                fontFamily: "'VT323', monospace",
                fontSize: 18,
                color: t.emptyText,
                margin: 0,
              }}>
                awaiting input
              </p>
              {agentExpertise && (
                <p style={{
                  fontSize: 12,
                  color: t.emptyExpertise,
                  margin: "8px 0 0",
                  maxWidth: 500,
                  textAlign: "center",
                  lineHeight: 1.6,
                }}>
                  {agentExpertise}
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className="msg-line"
              style={{
                marginBottom: msg.role === "user" ? 8 : 24,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                maxWidth: 720,
              }}
            >
              {msg.role === "user" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: t.accent, flexShrink: 0, fontFamily: "'VT323', monospace", fontSize: 18 }}>{">"}</span>
                  <span style={{ color: t.textUser }}>{msg.content}</span>
                </div>
              ) : (
                <div style={{ paddingLeft: 20, borderLeft: `2px solid ${t.border}` }}>
                  <span style={{ color: t.text }}>{msg.content}</span>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="msg-line" style={{ marginBottom: 20, color: t.dim }}>
              <span style={{ animation: "blink 1s step-end infinite" }}>_</span>
              {statusText && (
                <span style={{ marginLeft: 8, fontSize: 12, color: t.placeholder }}>
                  {statusText}
                </span>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shell-pad" style={{
          padding: "20px 64px 56px",
          flexShrink: 0,
          borderTop: `1px solid ${t.border}`,
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{
              fontFamily: "'VT323', monospace",
              fontSize: 20,
              color: t.accent,
              flexShrink: 0,
              lineHeight: "24px",
              paddingTop: 4,
            }}>
              {">"}
            </span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="..."
              disabled={loading}
              rows={1}
              className="input-field"
              style={{
                flex: 1,
                padding: "4px 0",
                border: "none",
                background: "transparent",
                color: t.text,
                fontSize: 14,
                fontFamily: "'Share Tech Mono', monospace",
                letterSpacing: "0.3px",
                resize: "none",
                overflow: "hidden",
                lineHeight: "24px",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="send-btn"
              style={{
                padding: "6px 16px",
                borderRadius: 2,
                border: `1px solid ${loading || !input.trim() ? t.border : t.accentFaint}`,
                background: "transparent",
                color: loading || !input.trim() ? t.border : t.accentDim,
                fontSize: 11,
                fontFamily: "'Press Start 2P', monospace",
                cursor: loading || !input.trim() ? "default" : "pointer",
                letterSpacing: "1px",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

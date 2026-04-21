"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  channel?: "web" | "telegram";
  ts?: number;
}

const themes = {
  dark: {
    bg: "#0f0f12",
    bgElevated: "#17171c",
    surface: "#1b1b22",
    surfaceHover: "#23232b",
    border: "#26262e",
    borderStrong: "#35353f",
    text: "#ece6d8",
    textDim: "#9b9690",
    textFaint: "#55525a",
    accent: "#e09b3e",
    accentSoft: "#b07a2e",
    accentWash: "rgba(224,155,62,0.09)",
    accentWashStrong: "rgba(224,155,62,0.16)",
    userBubble: "#1f1f26",
    userBubbleBorder: "#2d2d37",
    codeBg: "#0a0a0d",
    grain: "rgba(255,255,255,0.012)",
    shadow: "0 10px 40px -12px rgba(0,0,0,0.7)",
    scrollThumb: "#2a2a33",
  },
  light: {
    bg: "#f4efe5",
    bgElevated: "#eee7d9",
    surface: "#e9e2d1",
    surfaceHover: "#e0d8c4",
    border: "#dcd3bf",
    borderStrong: "#c5b99f",
    text: "#1c1a17",
    textDim: "#6b655b",
    textFaint: "#a39b8a",
    accent: "#a6651a",
    accentSoft: "#c4822e",
    accentWash: "rgba(166,101,26,0.08)",
    accentWashStrong: "rgba(166,101,26,0.14)",
    userBubble: "#e3dbc6",
    userBubbleBorder: "#cfc4a8",
    codeBg: "#ebe4d3",
    grain: "rgba(0,0,0,0.02)",
    shadow: "0 10px 40px -18px rgba(60,40,10,0.22)",
    scrollThumb: "#c8bda4",
  },
} as const;

type Theme = keyof typeof themes;

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [agentName, setAgentName] = useState("Lightweight Agent");
  const [agentRole, setAgentRole] = useState("");
  const [agentExpertise, setAgentExpertise] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [mounted, setMounted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = themes[theme];

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (saved === "light" || saved === "dark") setTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("theme", theme);
  }, [theme, mounted]);

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
          const isTg = entry.userId?.startsWith("telegram:");
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : undefined;
          loaded.push({
            role: "user",
            content: entry.userMessage,
            channel: isTg ? "telegram" : "web",
            ts,
          });
          loaded.push({
            role: "assistant",
            content: entry.assistantResponse,
            channel: isTg ? "telegram" : "web",
            ts,
          });
        }
        setMessages(loaded);
        requestAnimationFrame(() =>
          bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, atBottom]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distanceFromBottom < 80);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const now = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: text, channel: "web", ts: now }]);
    setLoading(true);
    setStatusText("");
    setAtBottom(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stream: true }),
      });

      if (!res.body) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response ?? data.error, channel: "web", ts: Date.now() },
        ]);
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
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: data.response, channel: "web", ts: Date.now() },
              ]);
            } else if (eventType === "error") {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: data.error ?? "error", channel: "web", ts: Date.now() },
              ]);
            }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "connection lost", channel: "web", ts: Date.now() },
      ]);
    } finally {
      setLoading(false);
      setStatusText("");
      inputRef.current?.focus();
    }
  }

  async function copyMessage(idx: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1400);
    } catch {
      /* ignore */
    }
  }

  function clearConversation() {
    if (loading) return;
    if (messages.length === 0) return;
    if (!confirm("Clear the visible conversation? (Server history is kept.)")) return;
    setMessages([]);
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "working late";
    if (h < 12) return "good morning";
    if (h < 18) return "good afternoon";
    return "good evening";
  }, []);

  const starters = useMemo(() => {
    if (!agentExpertise) return [];
    return [
      "What can you help me with?",
      "Show me how you work.",
    ];
  }, [agentExpertise]);

  return (
    <>
      <style>{`
        @keyframes fadeRise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(10px); filter: blur(4px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-2px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }

        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${t.scrollThumb};
          border-radius: 10px;
          border: 3px solid ${t.bg};
        }
        ::-webkit-scrollbar-thumb:hover { background: ${t.borderStrong}; }
        ::selection { background: ${t.accentWashStrong}; color: ${t.accent}; }

        body {
          font-feature-settings: "ss01", "ss02", "cv11";
        }

        .app-root {
          background:
            radial-gradient(1200px 600px at 50% -200px, ${t.accentWash}, transparent 70%),
            ${t.bg};
          color: ${t.text};
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          transition: background 0.4s ease, color 0.4s ease;
        }

        .grain {
          pointer-events: none;
          position: fixed; inset: 0;
          background-image:
            radial-gradient(${t.grain} 1px, transparent 1px),
            radial-gradient(${t.grain} 1px, transparent 1px);
          background-size: 3px 3px, 7px 7px;
          background-position: 0 0, 1px 2px;
          z-index: 2;
          mix-blend-mode: overlay;
        }

        .header {
          position: sticky; top: 0; z-index: 10;
          backdrop-filter: saturate(140%) blur(14px);
          -webkit-backdrop-filter: saturate(140%) blur(14px);
          background: ${theme === "dark" ? "rgba(15,15,18,0.72)" : "rgba(244,239,229,0.75)"};
          border-bottom: 1px solid ${t.border};
        }
        .header-row {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px 28px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mark {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, ${t.accent} 0%, ${t.accentSoft} 100%);
          display: grid; place-items: center;
          color: ${theme === "dark" ? "#0f0f12" : "#faf5e8"};
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 18px;
          font-variation-settings: "opsz" 144, "SOFT" 100;
          box-shadow: 0 6px 16px -6px ${t.accentWashStrong}, inset 0 0 0 1px rgba(255,255,255,0.08);
          flex-shrink: 0;
          user-select: none;
        }

        .name {
          font-family: 'Fraunces', serif;
          font-variation-settings: "opsz" 48, "SOFT" 50;
          font-weight: 500;
          font-size: 20px;
          letter-spacing: -0.01em;
          color: ${t.text};
          line-height: 1.1;
        }
        .role {
          font-family: 'Geist', sans-serif;
          font-size: 12px;
          color: ${t.textDim};
          letter-spacing: 0.02em;
          margin-top: 2px;
        }

        .btn-ghost {
          appearance: none;
          border: 1px solid ${t.border};
          background: ${t.bgElevated};
          color: ${t.textDim};
          font-family: 'Geist', sans-serif;
          font-size: 12px;
          font-weight: 500;
          padding: 7px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.18s ease;
          letter-spacing: 0.01em;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .btn-ghost:hover {
          color: ${t.text};
          border-color: ${t.borderStrong};
          background: ${t.surfaceHover};
        }
        .btn-ghost:disabled { opacity: 0.4; cursor: default; }

        .main {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
        .main-inner {
          max-width: 760px;
          margin: 0 auto;
          padding: 40px 28px 180px;
        }

        .empty {
          min-height: calc(100vh - 260px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          animation: staggerIn 0.7s ease-out;
        }
        .empty-greet {
          font-family: 'Fraunces', serif;
          font-variation-settings: "opsz" 144, "SOFT" 100, "WONK" 1;
          font-weight: 300;
          font-size: clamp(40px, 6vw, 68px);
          line-height: 1.02;
          letter-spacing: -0.025em;
          color: ${t.text};
          margin: 0;
        }
        .empty-greet em {
          font-style: italic;
          font-weight: 400;
          color: ${t.accent};
          font-variation-settings: "opsz" 144, "SOFT" 100, "WONK" 1;
        }
        .empty-sub {
          margin-top: 20px;
          font-family: 'Geist', sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: ${t.textDim};
          max-width: 520px;
        }
        .starter-row {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-top: 32px;
        }
        .starter {
          appearance: none;
          border: 1px solid ${t.border};
          background: ${t.bgElevated};
          color: ${t.text};
          font-family: 'Geist', sans-serif;
          font-size: 13px;
          padding: 9px 14px;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .starter:hover {
          border-color: ${t.accent};
          color: ${t.accent};
          background: ${t.accentWash};
        }

        .msg {
          animation: fadeRise 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) both;
          margin-bottom: 22px;
        }
        .msg-user-wrap {
          display: flex; justify-content: flex-end;
        }
        .msg-user {
          max-width: 78%;
          background: ${t.userBubble};
          color: ${t.text};
          border: 1px solid ${t.userBubbleBorder};
          border-radius: 16px 16px 4px 16px;
          padding: 12px 16px;
          font-family: 'Geist', sans-serif;
          font-size: 15px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-wrap: break-word;
          position: relative;
        }
        .msg-user .meta {
          display: flex; gap: 8px; align-items: center;
          font-size: 11px; color: ${t.textFaint};
          margin-top: 6px;
          font-family: 'Geist', sans-serif;
          letter-spacing: 0.02em;
        }
        .channel-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px;
          text-transform: uppercase;
          color: ${t.accentSoft};
          letter-spacing: 0.1em;
          padding: 1px 6px;
          border-radius: 4px;
          background: ${t.accentWash};
          border: 1px solid ${t.accentWash};
        }

        .msg-asst {
          display: flex;
          gap: 14px;
          position: relative;
        }
        .asst-mark {
          width: 28px; height: 28px;
          flex-shrink: 0;
          border-radius: 50%;
          background: ${t.bg};
          border: 1px solid ${t.borderStrong};
          color: ${t.accent};
          display: grid; place-items: center;
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: 13px;
          font-variation-settings: "opsz" 144, "SOFT" 100;
          margin-top: 2px;
        }
        .asst-body {
          flex: 1;
          font-family: 'Geist', sans-serif;
          font-size: 15px;
          line-height: 1.65;
          color: ${t.text};
          min-width: 0;
        }
        .asst-body p { margin: 0 0 0.8em; }
        .asst-body p:last-child { margin-bottom: 0; }
        .asst-body h1, .asst-body h2, .asst-body h3 {
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-variation-settings: "opsz" 48, "SOFT" 50;
          letter-spacing: -0.01em;
          margin: 1.2em 0 0.5em;
          line-height: 1.2;
        }
        .asst-body h1 { font-size: 1.5em; }
        .asst-body h2 { font-size: 1.3em; }
        .asst-body h3 { font-size: 1.15em; }
        .asst-body a { color: ${t.accent}; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
        .asst-body a:hover { text-decoration-thickness: 2px; }
        .asst-body ul, .asst-body ol { margin: 0.4em 0 0.8em; padding-left: 1.4em; }
        .asst-body li { margin: 0.25em 0; }
        .asst-body code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.88em;
          background: ${t.codeBg};
          padding: 1px 6px;
          border-radius: 4px;
          color: ${t.accent};
          border: 1px solid ${t.border};
        }
        .asst-body pre {
          background: ${t.codeBg};
          border: 1px solid ${t.border};
          padding: 14px 16px;
          border-radius: 10px;
          overflow-x: auto;
          margin: 0.8em 0;
          font-size: 13px;
        }
        .asst-body pre code {
          background: transparent;
          padding: 0;
          color: ${t.text};
          border: none;
          font-size: 13px;
        }
        .asst-body blockquote {
          margin: 0.8em 0;
          padding: 0.2em 0 0.2em 14px;
          border-left: 2px solid ${t.accent};
          color: ${t.textDim};
          font-style: italic;
        }
        .asst-body table {
          border-collapse: collapse;
          margin: 0.8em 0;
          font-size: 14px;
        }
        .asst-body th, .asst-body td {
          border: 1px solid ${t.border};
          padding: 6px 10px;
          text-align: left;
        }
        .asst-body th { background: ${t.bgElevated}; color: ${t.textDim}; font-weight: 500; }
        .asst-body hr { border: none; border-top: 1px solid ${t.border}; margin: 1.2em 0; }

        .asst-meta {
          margin-top: 8px;
          display: flex; align-items: center; gap: 10px;
          font-family: 'Geist', sans-serif;
          font-size: 11px;
          color: ${t.textFaint};
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .msg-asst:hover .asst-meta { opacity: 1; }

        .copy-btn {
          appearance: none;
          background: transparent;
          border: 1px solid ${t.border};
          color: ${t.textDim};
          font-family: 'Geist', sans-serif;
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .copy-btn:hover {
          color: ${t.accent};
          border-color: ${t.accent};
        }

        .thinking {
          display: flex; align-items: center; gap: 14px;
          padding-left: 42px;
          animation: fadeRise 0.3s ease-out;
          color: ${t.textDim};
          font-family: 'Geist', sans-serif;
          font-size: 14px;
        }
        .thinking-dots { display: inline-flex; gap: 4px; }
        .thinking-dots span {
          width: 6px; height: 6px; border-radius: 50%;
          background: ${t.accent};
          display: inline-block;
          animation: pulseDot 1.2s ease-in-out infinite;
        }
        .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
        .thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
        .status-text {
          font-size: 12px;
          color: ${t.textFaint};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          letter-spacing: 0.01em;
          animation: shimmer 3s linear infinite;
          background: linear-gradient(90deg, ${t.textFaint} 0%, ${t.accent} 50%, ${t.textFaint} 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .input-dock {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 20;
          padding: 18px 28px 22px;
          background: linear-gradient(180deg, transparent 0%, ${theme === "dark" ? "rgba(15,15,18,0.85)" : "rgba(244,239,229,0.9)"} 40%, ${t.bg} 100%);
          pointer-events: none;
        }
        .input-shell {
          max-width: 760px;
          margin: 0 auto;
          pointer-events: auto;
        }

        .input-card {
          background: ${t.bgElevated};
          border: 1px solid ${t.border};
          border-radius: 16px;
          box-shadow: ${t.shadow};
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }
        .input-card:focus-within {
          border-color: ${t.accent};
          box-shadow: ${t.shadow}, 0 0 0 3px ${t.accentWash};
        }
        .input-row {
          display: flex;
          align-items: flex-end;
          padding: 12px 12px 12px 18px;
          gap: 10px;
        }
        .input-ta {
          flex: 1;
          resize: none;
          border: none;
          outline: none;
          background: transparent;
          color: ${t.text};
          font-family: 'Geist', sans-serif;
          font-size: 15px;
          line-height: 1.5;
          padding: 8px 0;
          max-height: 240px;
          overflow-y: auto;
        }
        .input-ta::placeholder { color: ${t.textFaint}; }
        .send-btn {
          appearance: none;
          border: none;
          background: ${t.accent};
          color: ${theme === "dark" ? "#0f0f12" : "#faf5e8"};
          width: 36px; height: 36px;
          border-radius: 10px;
          cursor: pointer;
          display: grid; place-items: center;
          transition: all 0.18s ease;
          flex-shrink: 0;
        }
        .send-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -6px ${t.accentWashStrong};
        }
        .send-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }
        .send-btn:disabled {
          background: ${t.surface};
          color: ${t.textFaint};
          cursor: default;
        }
        .hint {
          margin-top: 10px;
          text-align: center;
          font-family: 'Geist', sans-serif;
          font-size: 11px;
          color: ${t.textFaint};
          letter-spacing: 0.02em;
        }
        .kbd {
          display: inline-block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid ${t.border};
          background: ${t.surface};
          color: ${t.textDim};
          margin: 0 2px;
        }

        .scroll-fab {
          position: fixed;
          bottom: 130px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 15;
          appearance: none;
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid ${t.border};
          background: ${t.bgElevated};
          color: ${t.textDim};
          cursor: pointer;
          display: grid; place-items: center;
          box-shadow: ${t.shadow};
          animation: fadeRise 0.25s ease-out;
          transition: all 0.18s ease;
        }
        .scroll-fab:hover { color: ${t.accent}; border-color: ${t.accent}; }

        @media (max-width: 640px) {
          .header-row { padding: 12px 16px; }
          .main-inner { padding: 24px 16px 200px; }
          .input-dock { padding: 12px 16px 18px; }
          .empty-greet { font-size: 40px; }
          .role { display: none; }
        }
      `}</style>

      <div className="grain" />

      <div className="app-root">

        {/* Header */}
        <header className="header">
          <div className="header-row">
            <div className="mark">
              {agentName.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="name">{agentName}</div>
              {agentRole && <div className="role">{agentRole}</div>}
            </div>

            <button
              className="btn-ghost"
              onClick={clearConversation}
              disabled={loading || messages.length === 0}
              title="Clear visible conversation"
              aria-label="Clear conversation"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>

            <button
              className="btn-ghost"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="main" ref={scrollerRef} onScroll={onScroll}>
          <div className="main-inner">
            {messages.length === 0 && (
              <div className="empty">
                <h1 className="empty-greet">
                  {greeting},<br />
                  <em>how can I help?</em>
                </h1>
                {agentExpertise && (
                  <p className="empty-sub">{agentExpertise}</p>
                )}
                {starters.length > 0 && (
                  <div className="starter-row">
                    {starters.map((s) => (
                      <button
                        key={s}
                        className="starter"
                        onClick={() => {
                          setInput(s);
                          inputRef.current?.focus();
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="msg msg-user-wrap">
                  <div className="msg-user">
                    {msg.content}
                    {(msg.channel === "telegram" || msg.ts) && (
                      <div className="meta">
                        {msg.channel === "telegram" && <span className="channel-tag">TG</span>}
                        {msg.ts && <span>{formatRelativeTime(msg.ts)}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div key={i} className="msg msg-asst">
                  <div className="asst-mark">{agentName.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="asst-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    <div className="asst-meta">
                      {msg.ts && <span>{formatRelativeTime(msg.ts)}</span>}
                      <button
                        className="copy-btn"
                        onClick={() => copyMessage(i, msg.content)}
                        aria-label="Copy message"
                      >
                        {copiedIdx === i ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            copied
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="thinking">
                <div className="thinking-dots">
                  <span /><span /><span />
                </div>
                {statusText && <span className="status-text">{statusText}</span>}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Scroll-to-bottom FAB */}
        {!atBottom && (
          <button className="scroll-fab" onClick={scrollToBottom} aria-label="Scroll to bottom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* Input */}
        <div className="input-dock">
          <div className="input-shell">
            <div className="input-card">
              <div className="input-row">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 240) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={loading ? "Thinking…" : `Message ${agentName}`}
                  disabled={loading}
                  rows={1}
                  className="input-ta"
                />
                <button
                  className="send-btn"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  aria-label="Send message"
                  title="Send"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="hint">
              <span className="kbd">↵</span> to send · <span className="kbd">⇧↵</span> for new line
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

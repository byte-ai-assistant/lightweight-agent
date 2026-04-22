"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ─────────────────────────────────────────────────────────────

interface ToolCall {
  name: string;
}
interface MemoryHit {
  path: string;
  heading: string;
  score: number;
}
interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}
interface Message {
  role: "user" | "assistant";
  content: string;
  channel?: "web" | "telegram" | "cron";
  ts?: number;
  tools?: ToolCall[];
  memoryHits?: MemoryHit[];
  usage?: Usage;
}

interface Identity {
  name: string;
  role?: string;
  expertise?: string;
  replyStyle?: string;
  timezone?: string;
}

interface SkillItem {
  name: string;
  description: string;
  location: string;
  userInvocable: boolean;
  requirementsMet: boolean;
  unmetRequirements?: string[];
}
interface McpItem {
  name: string;
  status: "active" | "inactive";
  reason?: string;
}

interface StateSnapshot {
  session: { id: string; ageMs: number; messageCount: number; capacity: number } | null;
  cron: {
    active: number;
    runningIds: string[];
    jobs: {
      id: string;
      description: string;
      schedule: string;
      enabled: boolean;
      lastRun: string | null;
      nextRun: string | null;
      running: boolean;
    }[];
  };
  skills: { total: number; available: number; unavailable: number; list: SkillItem[] };
  mcp: McpItem[];
  memory: { files: number; totalBytes: number; lastWrite: string | null };
  today: {
    chatTurns: number;
    tgTurns: number;
    events: { kind: "chat" | "telegram" | "cron"; at: number; label: string }[];
    startMs: number;
  };
  activeSessions: number;
  now: number;
}

interface LogEvent {
  seq: number;
  at: number;
  kind: "tool" | "memory" | "usage" | "cron_fire" | "cron_skip" | "error" | "status";
  userId?: string;
  payload: Record<string, unknown>;
}

type Drawer = null | "skills" | "logs" | "vitals";

// ── Themes ────────────────────────────────────────────────────────────

const themes = {
  dark: {
    bg: "#0d0e12",
    bgElev: "#14151c",
    surface: "#1a1b23",
    surfaceHover: "#22232d",
    border: "#262834",
    borderStrong: "#333644",
    text: "#e9e6df",
    textDim: "#9b988f",
    textFaint: "#5a5760",
    ghost: "#3a3845",
    accent: "#f0795e",
    accentDim: "#b25a46",
    accentWash: "rgba(240,121,94,0.10)",
    accentWashStrong: "rgba(240,121,94,0.20)",
    accentInk: "#0d0e12",
    userBubble: "#262a36",
    userBubbleBorder: "#333746",
    userBubbleText: "#ede9df",
    success: "#7dc97e",
    warn: "#e0b04a",
    danger: "#e06a6a",
    shadow: "0 10px 30px -14px rgba(0,0,0,0.7), 0 2px 6px -2px rgba(0,0,0,0.3)",
    grain: "rgba(255,255,255,0.012)",
    bgRgba: "rgba(13,14,18,0.78)",
    bgTransparent: "rgba(13,14,18,0)",
    scrollThumb: "#2a2c38",
  },
  light: {
    bg: "#f6f3ec",
    bgElev: "#ede8dc",
    surface: "#e5dfce",
    surfaceHover: "#dcd5bf",
    border: "#d3ccb5",
    borderStrong: "#b6ad91",
    text: "#1b1a18",
    textDim: "#5e5a52",
    textFaint: "#9a9588",
    ghost: "#bfb89f",
    accent: "#c4563f",
    accentDim: "#a64733",
    accentWash: "rgba(196,86,63,0.08)",
    accentWashStrong: "rgba(196,86,63,0.18)",
    accentInk: "#faf5e8",
    userBubble: "#e8dcc3",
    userBubbleBorder: "#d3c5a3",
    userBubbleText: "#1b1a18",
    success: "#3d8a41",
    warn: "#a87520",
    danger: "#b04040",
    shadow: "0 10px 30px -18px rgba(60,40,10,0.3), 0 2px 6px -2px rgba(60,40,10,0.1)",
    grain: "rgba(60,40,10,0.018)",
    bgRgba: "rgba(246,243,236,0.82)",
    bgTransparent: "rgba(246,243,236,0)",
    scrollThumb: "#cac2a8",
  },
} as const;

type Theme = keyof typeof themes;
type ThemeDef = (typeof themes)[Theme];

// ── Helpers ───────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}
function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
function prettyToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/i, "").replace(/^agent__/, "").replace(/_/g, " ");
}
function stemPath(p: string): string {
  return (p.split("/").pop() ?? p).replace(/\.qmd$/i, "");
}
function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return "…/" + parts.slice(-2).join("/");
}
function describeToolInput(name: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, any>;
  const trim = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

  // Priority order matches how busy tools actually surface useful context.
  if (typeof i.query === "string") return trim(i.query);
  if (typeof i.question === "string") return trim(i.question);
  if (typeof i.pattern === "string") return trim(i.pattern);
  if (typeof i.command === "string") return trim(i.command);
  if (typeof i.url === "string") return trim(i.url, 70);
  if (typeof i.file_path === "string") return shortPath(i.file_path);
  if (typeof i.path === "string") return shortPath(i.path);
  if (typeof i.skillName === "string") return i.skillName;
  if (typeof i.to === "string") return `to ${i.to}`;
  if (typeof i.subject === "string") return trim(i.subject, 60);
  if (typeof i.description === "string") return trim(i.description, 70);
  if (typeof i.prompt === "string") return trim(i.prompt, 80);
  if (typeof i.message === "string") return trim(i.message, 80);
  if (typeof i.text === "string") return trim(i.text, 70);
  if (typeof i.name === "string") return i.name;

  return undefined;
}
function friendlyChannel(userId?: string): { label: string; tone: string } | null {
  if (!userId) return null;
  if (userId.startsWith("cron:")) return { label: userId, tone: "cron" };
  if (userId.startsWith("telegram:")) return { label: "telegram", tone: "tg" };
  if (userId.startsWith("web:")) return { label: "web", tone: "web" };
  return { label: userId, tone: "other" };
}

// ── Root ──────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [activeOp, setActiveOp] = useState<
    | { kind: "tool"; name: string; detail?: string }
    | { kind: "memory"; path: string; score: number }
    | null
  >(null);

  const [identity, setIdentity] = useState<Identity>({ name: "Lightweight Agent" });
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [latestSeq, setLatestSeq] = useState(0);

  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [logFilter, setLogFilter] = useState<"all" | "tool" | "memory" | "cron" | "error">("all");
  const [skillSearch, setSkillSearch] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = themes[theme];

  // ── Theme persistence ──
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (saved === "light" || saved === "dark") setTheme(saved);
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted) localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  // ── Identity ──
  useEffect(() => {
    fetch("/api/identity")
      .then((r) => r.json())
      .then((data: Identity) => {
        if (data.name) document.title = data.name;
        setIdentity(data);
      })
      .catch(() => {});
  }, []);

  // ── History ──
  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;
        const loaded: Message[] = [];
        for (const entry of data.messages) {
          const isTg = entry.userId?.startsWith("telegram:");
          const isCron = entry.userId?.startsWith("cron:");
          const ts = entry.timestamp ? Date.parse(entry.timestamp) : undefined;
          const channel: Message["channel"] = isTg ? "telegram" : isCron ? "cron" : "web";
          loaded.push({ role: "user", content: entry.userMessage, channel, ts });
          loaded.push({ role: "assistant", content: entry.assistantResponse, channel, ts });
        }
        setMessages(loaded);
        requestAnimationFrame(() =>
          bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }),
        );
      })
      .catch(() => {});
  }, []);

  // ── State snapshot polling ──
  const fetchSnapshot = useCallback(async () => {
    try {
      const r = await fetch("/api/state");
      if (!r.ok) return;
      const data: StateSnapshot = await r.json();
      setSnapshot(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") fetchSnapshot();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchSnapshot]);

  // ── Logs polling (only when drawer open or chat loading) ──
  const fetchLogs = useCallback(async () => {
    try {
      const url = latestSeq > 0 ? `/api/events?since=${latestSeq}` : "/api/events";
      const r = await fetch(url);
      if (!r.ok) return;
      const data: { events: LogEvent[]; latestSeq: number } = await r.json();
      if (data.events.length > 0) {
        setLogs((prev) => [...prev, ...data.events].slice(-300));
      }
      setLatestSeq(data.latestSeq);
    } catch {
      /* ignore */
    }
  }, [latestSeq]);

  useEffect(() => {
    if (drawer === "logs") {
      fetchLogs();
      const iv = setInterval(fetchLogs, 2000);
      return () => clearInterval(iv);
    }
  }, [drawer, fetchLogs]);

  // Also poll when a chat is running (to surface live cron events in drawer)
  useEffect(() => {
    if (!loading) return;
    fetchLogs();
    const iv = setInterval(fetchLogs, 1500);
    return () => clearInterval(iv);
  }, [loading, fetchLogs]);

  // ── Scroll tracking ──
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, atBottom, activeOp]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 80);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  // ── Send ──
  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const now = Date.now();
    setMessages((prev) => [...prev, { role: "user", content: text, channel: "web", ts: now }]);
    setLoading(true);
    setStatusText("");
    setActiveOp(null);
    setAtBottom(true);

    const pendingTools: ToolCall[] = [];
    const pendingHits: MemoryHit[] = [];
    let pendingUsage: Usage | undefined;

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
            } else if (eventType === "tool") {
              pendingTools.push({ name: data.name });
              setActiveOp({
                kind: "tool",
                name: prettyToolName(data.name),
                detail: describeToolInput(data.name, data.input),
              });
            } else if (eventType === "memory_hit") {
              pendingHits.push({ path: data.path, heading: data.heading, score: data.score });
              setActiveOp({
                kind: "memory",
                path: stemPath(data.path),
                score: data.score,
              });
            } else if (eventType === "usage") {
              pendingUsage = {
                inputTokens: data.inputTokens,
                outputTokens: data.outputTokens,
                cacheReadTokens: data.cacheReadTokens,
                cacheWriteTokens: data.cacheWriteTokens,
                costUsd: data.costUsd,
              };
            } else if (eventType === "done") {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: data.response,
                  channel: "web",
                  ts: Date.now(),
                  tools: pendingTools.length ? pendingTools : undefined,
                  memoryHits: pendingHits.length ? pendingHits : undefined,
                  usage: pendingUsage,
                },
              ]);
            } else if (eventType === "error") {
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: data.error ?? "error",
                  channel: "web",
                  ts: Date.now(),
                },
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
      setActiveOp(null);
      inputRef.current?.focus();
      fetchSnapshot();
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
    if (loading || messages.length === 0) return;
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

  const nextCron = useMemo(() => {
    if (!snapshot?.cron?.jobs) return null;
    for (const j of snapshot.cron.jobs) {
      if (j.enabled && j.nextRun) return j;
    }
    return null;
  }, [snapshot]);

  const sigilLetter = (identity.name ?? "A").trim().charAt(0).toUpperCase() || "A";

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return logs;
    if (logFilter === "cron") return logs.filter((e) => e.kind === "cron_fire" || e.kind === "cron_skip");
    if (logFilter === "error") return logs.filter((e) => e.kind === "error");
    return logs.filter((e) => e.kind === logFilter);
  }, [logs, logFilter]);

  const filteredSkills = useMemo(() => {
    if (!snapshot?.skills?.list) return [];
    const q = skillSearch.trim().toLowerCase();
    if (!q) return snapshot.skills.list;
    return snapshot.skills.list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [snapshot, skillSearch]);

  return (
    <>
      <style>{`
        @keyframes fadeRise {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes dotBounce {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 ${themes.dark.accentWashStrong}; }
          100% { box-shadow: 0 0 0 10px rgba(240,121,94,0); }
        }

        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: ${t.scrollThumb};
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover { background: ${t.ghost}; }
        ::selection { background: ${t.accentWashStrong}; color: ${t.accent}; }

        body {
          font-feature-settings: "ss01", "cv11";
          -webkit-font-smoothing: antialiased;
        }

        .app {
          background: ${t.bg};
          color: ${t.text};
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          transition: background 0.35s ease, color 0.35s ease;
        }

        /* ── HEADER ─────────────────────────────────────────────── */
        .hdr {
          position: sticky; top: 0; z-index: 20;
          backdrop-filter: saturate(140%) blur(14px);
          -webkit-backdrop-filter: saturate(140%) blur(14px);
          background: ${t.bgRgba};
          border-bottom: 1px solid ${t.border};
        }
        .hdr-row {
          max-width: 1120px;
          margin: 0 auto;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sigil {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, ${t.accent} 0%, ${t.accentDim} 100%);
          display: grid; place-items: center;
          color: ${t.accentInk};
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 17px;
          font-variation-settings: "opsz" 144, "SOFT" 80;
          box-shadow: 0 4px 12px -4px ${t.accentWashStrong}, inset 0 0 0 1px rgba(255,255,255,0.08);
          flex-shrink: 0;
          user-select: none;
          position: relative;
        }
        .sigil.live::after {
          content: "";
          position: absolute;
          inset: -3px;
          border-radius: 12px;
          border: 1.5px solid ${t.accent};
          animation: ringPulse 1.6s ease-out infinite;
        }

        .name {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: ${t.text};
          line-height: 1.2;
        }
        .role {
          font-size: 12px;
          color: ${t.textDim};
          margin-top: 1px;
          letter-spacing: 0.005em;
        }

        .state-chips {
          display: flex; gap: 6px;
          margin-left: 6px;
          flex-wrap: wrap;
        }
        .chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 9px;
          border-radius: 7px;
          border: 1px solid ${t.border};
          background: ${t.bgElev};
          color: ${t.textDim};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.01em;
        }
        .chip .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: ${t.accent};
          animation: pulseDot 2.4s ease-in-out infinite;
        }
        .chip.hot { color: ${t.accent}; border-color: ${t.accent}; }
        .chip.live { color: ${t.accent}; border-color: ${t.accent}; }
        .chip.live .dot { animation: pulseDot 1.2s ease-in-out infinite; }

        .hdr-spacer { flex: 1; }

        .btn-bar {
          display: inline-flex;
          border: 1px solid ${t.border};
          background: ${t.bgElev};
          border-radius: 9px;
          padding: 3px;
          gap: 1px;
        }
        .iconbtn {
          appearance: none;
          border: none;
          background: transparent;
          color: ${t.textDim};
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.01em;
          display: inline-flex; align-items: center; gap: 5px;
          transition: all 0.15s ease;
        }
        .iconbtn:hover:not(:disabled) {
          background: ${t.surfaceHover};
          color: ${t.text};
        }
        .iconbtn.active {
          background: ${t.accentWash};
          color: ${t.accent};
        }
        .iconbtn:disabled { opacity: 0.35; cursor: default; }
        .iconbtn .count {
          background: ${t.surface};
          color: ${t.textDim};
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .iconbtn.active .count {
          background: ${t.accentWash};
          color: ${t.accent};
        }

        /* ── DAY RIBBON ─────────────────────────────────────────── */
        .ribbon-wrap {
          max-width: 1120px; margin: 0 auto;
          padding: 0 24px 8px;
          display: flex; align-items: center; gap: 10px;
        }
        .ribbon {
          flex: 1;
          height: 14px;
          position: relative;
          display: flex;
          gap: 2px;
        }
        .ribbon-cell {
          flex: 1;
          border-radius: 2px;
        }
        .ribbon-now {
          position: absolute;
          top: -3px; bottom: -3px;
          width: 1.5px;
          background: ${t.accent};
          box-shadow: 0 0 6px ${t.accentWashStrong};
          pointer-events: none;
        }
        .ribbon-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: ${t.textFaint};
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        /* ── MAIN ───────────────────────────────────────────────── */
        .main {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
        .main-inner {
          max-width: 800px;
          margin: 0 auto;
          padding: 28px 24px 200px;
        }

        /* ── EMPTY ──────────────────────────────────────────────── */
        .empty {
          min-height: calc(100vh - 260px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          animation: fadeRise 0.6s ease-out;
        }
        .empty-greet {
          font-family: 'Fraunces', serif;
          font-weight: 400;
          font-size: clamp(40px, 6.2vw, 66px);
          line-height: 1.04;
          letter-spacing: -0.02em;
          margin: 0;
          font-variation-settings: "opsz" 144, "SOFT" 50;
          color: ${t.text};
        }
        .empty-greet em {
          font-style: italic;
          color: ${t.accent};
          font-weight: 400;
          font-variation-settings: "opsz" 144, "SOFT" 80, "WONK" 1;
        }
        .empty-sub {
          margin-top: 18px;
          font-size: 15px;
          line-height: 1.55;
          color: ${t.textDim};
          max-width: 540px;
        }
        .empty-hint {
          margin-top: 32px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: ${t.textFaint};
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .kbd {
          display: inline-block;
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid ${t.border};
          background: ${t.surface};
          color: ${t.textDim};
          margin: 0 2px;
          font-size: 10.5px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }

        /* ── USER MESSAGE ───────────────────────────────────────── */
        .u-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          margin: 6px 0 14px;
          animation: fadeRise 0.25s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .u-msg {
          max-width: min(78%, 640px);
          background: ${(t as any).userBubble};
          color: ${(t as any).userBubbleText};
          border: 1px solid ${(t as any).userBubbleBorder};
          border-radius: 16px 16px 4px 16px;
          padding: 10px 14px;
          font-size: 15px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: anywhere;
          font-weight: 450;
          width: fit-content;
        }
        .u-msg ::selection {
          background: ${t.accent};
          color: ${theme === "dark" ? "#13110d" : "#faf5e8"};
        }
        .u-meta {
          display: flex; gap: 6px;
          margin-top: 3px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: ${t.textFaint};
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .u-meta .tg { color: ${t.accent}; }

        /* ── ASSISTANT MESSAGE ──────────────────────────────────── */
        .a-wrap {
          display: grid;
          grid-template-columns: 30px 1fr;
          gap: 10px;
          margin: 18px 0 22px;
          animation: fadeRise 0.28s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .a-avatar {
          width: 26px; height: 26px;
          border-radius: 8px;
          background: ${t.surface};
          border: 1px solid ${t.border};
          color: ${t.accent};
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: 13px;
          display: grid; place-items: center;
          margin-top: 2px;
          font-variation-settings: "opsz" 144, "SOFT" 60;
        }
        .a-body {
          min-width: 0;
          font-size: 15px;
          line-height: 1.62;
          color: ${t.text};
        }
        .a-body > div > :first-child { margin-top: 0; }
        .a-body p { margin: 0 0 0.7em; }
        .a-body h1, .a-body h2, .a-body h3 {
          font-weight: 600;
          letter-spacing: -0.01em;
          margin: 1.1em 0 0.4em;
          line-height: 1.25;
        }
        .a-body h1 { font-size: 1.4em; }
        .a-body h2 { font-size: 1.22em; }
        .a-body h3 { font-size: 1.1em; }
        .a-body a {
          color: ${t.accent};
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
        .a-body a:hover { text-decoration-thickness: 2px; }
        .a-body ul, .a-body ol { margin: 0.3em 0 0.7em; padding-left: 1.4em; }
        .a-body li { margin: 0.2em 0; }
        .a-body code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.88em;
          background: ${t.surface};
          padding: 1px 6px;
          border-radius: 4px;
          color: ${t.accent};
          border: 1px solid ${t.border};
        }
        .a-body pre {
          background: ${t.bgElev};
          border: 1px solid ${t.border};
          padding: 12px 14px;
          border-radius: 10px;
          overflow-x: auto;
          margin: 0.7em 0;
        }
        .a-body pre code { background: transparent; padding: 0; border: none; color: ${t.text}; font-size: 13px; }
        .a-body blockquote {
          margin: 0.7em 0;
          padding: 0.1em 0 0.1em 12px;
          border-left: 2px solid ${t.accent};
          color: ${t.textDim};
        }
        .a-body table { border-collapse: collapse; margin: 0.7em 0; font-size: 14px; }
        .a-body th, .a-body td { border: 1px solid ${t.border}; padding: 5px 9px; text-align: left; }
        .a-body th { background: ${t.surface}; color: ${t.textDim}; font-weight: 500; }
        .a-body hr { border: none; border-top: 1px solid ${t.border}; margin: 1.1em 0; }

        /* ── META ROW (under assistant body) ───────────────────── */
        .meta-row {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 6px;
          margin-top: 10px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: ${t.textDim};
        }
        .pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 2.5px 8px;
          border-radius: 999px;
          border: 1px solid ${t.border};
          background: ${t.bgElev};
          letter-spacing: 0.02em;
        }
        .pill.tool {
          color: ${t.accent};
          border-color: ${t.accentWashStrong};
          background: ${t.accentWash};
        }
        .pill.mem {
          color: ${t.textDim};
          cursor: help;
        }
        .pill.mem:hover {
          color: ${t.accent};
          border-color: ${t.accent};
        }
        .pill.cost {
          color: ${t.textFaint};
        }
        .pill .glyph {
          font-family: 'Fraunces', serif;
          font-size: 11px;
          line-height: 1;
        }
        .time-stamp {
          color: ${t.textFaint};
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.06em;
          margin-left: auto;
        }
        .copy-inline {
          appearance: none;
          background: transparent;
          border: 1px solid ${t.border};
          color: ${t.textFaint};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 999px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          transition: all 0.15s ease;
          opacity: 0;
        }
        .a-wrap:hover .copy-inline { opacity: 1; }
        .copy-inline:hover { color: ${t.accent}; border-color: ${t.accent}; }

        /* ── ACTIVE SKILL INDICATOR ─────────────────────────────── */
        .running {
          display: grid;
          grid-template-columns: 30px 1fr;
          gap: 10px;
          margin: 18px 0 22px;
          animation: fadeRise 0.25s ease-out;
        }
        .running .a-avatar::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 10px;
          border: 1.5px solid ${t.accent};
          animation: ringPulse 1.6s ease-out infinite;
        }
        .running .a-avatar { position: relative; }
        .running-body { min-width: 0; }
        .running-head {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 12px;
          border-radius: 999px;
          background: ${t.accentWash};
          border: 1px solid ${t.accentWashStrong};
          color: ${t.accent};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.01em;
        }
        .running-head .dots { display: inline-flex; gap: 3px; }
        .running-head .dots span {
          width: 4px; height: 4px; border-radius: 50%;
          background: ${t.accent};
          animation: dotBounce 1.2s ease-in-out infinite;
        }
        .running-head .dots span:nth-child(2) { animation-delay: 0.15s; }
        .running-head .dots span:nth-child(3) { animation-delay: 0.3s; }
        .running-head .glyph {
          font-family: 'Fraunces', serif;
          font-size: 13px;
          line-height: 1;
        }
        .running-head .glyph.mem { color: ${t.warn}; }
        .running-head {
          max-width: 100%;
          flex-wrap: wrap;
        }
        .running-head .op-name { font-weight: 500; }
        .running-head .op-detail {
          color: ${t.textDim};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          padding-left: 6px;
          border-left: 1px solid ${t.accentWashStrong};
          margin-left: 2px;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .running-head .op-score {
          color: ${t.textFaint};
          margin-left: 4px;
        }

        /* ── INPUT DOCK ─────────────────────────────────────────── */
        .dock {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 25;
          padding: 20px 24px 22px;
          pointer-events: none;
          background: linear-gradient(180deg, ${t.bgTransparent} 0%, ${t.bgRgba} 40%, ${t.bg} 100%);
        }
        .dock-inner {
          max-width: 800px; margin: 0 auto;
          pointer-events: auto;
        }
        .card {
          background: ${t.bgElev};
          border: 1px solid ${t.border};
          border-radius: 14px;
          box-shadow: ${t.shadow};
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .card:focus-within {
          border-color: ${t.accent};
          box-shadow: ${t.shadow}, 0 0 0 3px ${t.accentWash};
        }
        .card-row {
          display: flex; align-items: flex-end;
          padding: 10px 10px 10px 18px;
          gap: 10px;
        }
        .ta {
          flex: 1;
          resize: none; border: none; outline: none;
          background: transparent;
          color: ${t.text};
          font-family: 'Geist', sans-serif;
          font-size: 15px;
          line-height: 1.5;
          padding: 8px 0;
          max-height: 220px;
          overflow-y: auto;
        }
        .ta::placeholder { color: ${t.textFaint}; }
        .send {
          appearance: none; border: none;
          background: ${t.accent};
          color: ${t.accentInk};
          width: 36px; height: 36px;
          border-radius: 10px;
          cursor: pointer;
          display: grid; place-items: center;
          transition: all 0.16s ease;
          flex-shrink: 0;
        }
        .send:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -6px ${t.accentWashStrong};
        }
        .send:active:not(:disabled) { transform: scale(0.95); }
        .send:disabled {
          background: ${t.surface};
          color: ${t.textFaint};
          cursor: default;
        }
        .hint {
          margin-top: 8px;
          text-align: center;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: ${t.textFaint};
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* ── DRAWER ─────────────────────────────────────────────── */
        .drawer-backdrop {
          position: fixed; inset: 0; z-index: 40;
          background: rgba(0,0,0,0.36);
          animation: fadeRise 0.18s ease-out;
        }
        .drawer {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 440px;
          max-width: calc(100vw - 32px);
          z-index: 41;
          background: ${t.bgElev};
          border-left: 1px solid ${t.border};
          box-shadow: -20px 0 40px -20px rgba(0,0,0,0.5);
          animation: slideRight 0.28s cubic-bezier(0.2,0.7,0.2,1);
          display: flex; flex-direction: column;
        }
        .drawer-hdr {
          padding: 16px 20px;
          border-bottom: 1px solid ${t.border};
          display: flex; align-items: center; justify-content: space-between;
        }
        .drawer-hdr h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.005em;
          color: ${t.text};
        }
        .drawer-hdr .sub {
          margin-top: 2px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: ${t.textDim};
          letter-spacing: 0.04em;
        }
        .x-btn {
          appearance: none;
          background: transparent;
          border: 1px solid ${t.border};
          color: ${t.textDim};
          width: 28px; height: 28px;
          border-radius: 8px;
          cursor: pointer;
          display: grid; place-items: center;
          transition: all 0.15s ease;
        }
        .x-btn:hover { color: ${t.accent}; border-color: ${t.accent}; }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px 24px;
        }

        .drawer-section-head {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${t.textFaint};
          margin: 16px 0 10px;
        }
        .drawer-section-head:first-child { margin-top: 0; }

        /* ── SKILLS DRAWER ──────────────────────────────────────── */
        .skill-search {
          width: 100%;
          padding: 8px 12px;
          background: ${t.surface};
          border: 1px solid ${t.border};
          border-radius: 8px;
          color: ${t.text};
          font-family: 'Geist', sans-serif;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease;
          margin-bottom: 8px;
        }
        .skill-search:focus { border-color: ${t.accent}; }
        .skill-search::placeholder { color: ${t.textFaint}; }

        .skill-item {
          padding: 10px 12px;
          border: 1px solid ${t.border};
          background: ${t.surface};
          border-radius: 9px;
          margin-bottom: 6px;
          transition: border-color 0.15s ease;
        }
        .skill-item:hover { border-color: ${t.borderStrong}; }
        .skill-item.unmet { opacity: 0.62; }
        .skill-item-head {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 3px;
        }
        .skill-item-name {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          color: ${t.text};
          font-weight: 500;
        }
        .skill-item-dot {
          width: 7px; height: 7px; border-radius: 50%;
          flex-shrink: 0;
        }
        .skill-item-dot.ok { background: ${t.success}; }
        .skill-item-dot.warn { background: ${t.warn}; }
        .skill-item-dot.err { background: ${t.danger}; }
        .skill-loc {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          color: ${t.textFaint};
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 1px 6px;
          border-radius: 4px;
          background: ${t.bgElev};
          border: 1px solid ${t.border};
          margin-left: auto;
        }
        .skill-item-desc {
          font-size: 12.5px;
          line-height: 1.5;
          color: ${t.textDim};
          margin-top: 2px;
        }
        .skill-item-unmet {
          margin-top: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: ${t.warn};
        }

        .mcp-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px;
          border: 1px solid ${t.border};
          background: ${t.surface};
          border-radius: 9px;
          margin-bottom: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
        }
        .mcp-item .mcp-dot {
          width: 8px; height: 8px; border-radius: 50%;
          flex-shrink: 0;
        }
        .mcp-item .mcp-dot.on { background: ${t.success}; box-shadow: 0 0 6px ${t.success}; }
        .mcp-item .mcp-dot.off { background: ${t.ghost}; }
        .mcp-item .mcp-name { color: ${t.text}; font-weight: 500; }
        .mcp-item .mcp-reason { color: ${t.textFaint}; margin-left: auto; font-size: 11px; }

        /* ── LOGS DRAWER ────────────────────────────────────────── */
        .log-filters {
          display: flex; gap: 4px;
          margin-bottom: 12px;
        }
        .log-filter-btn {
          appearance: none;
          background: transparent;
          border: 1px solid ${t.border};
          color: ${t.textDim};
          padding: 4px 10px;
          border-radius: 7px;
          cursor: pointer;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.02em;
          transition: all 0.15s ease;
        }
        .log-filter-btn:hover { color: ${t.text}; border-color: ${t.borderStrong}; }
        .log-filter-btn.active {
          background: ${t.accentWash};
          color: ${t.accent};
          border-color: ${t.accent};
        }

        .log-row {
          display: grid;
          grid-template-columns: 60px 16px 1fr auto;
          gap: 10px;
          padding: 8px 10px;
          border-bottom: 1px solid ${t.border};
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px;
          align-items: baseline;
        }
        .log-row:last-child { border-bottom: none; }
        .log-time { color: ${t.textFaint}; font-size: 10.5px; }
        .log-glyph {
          font-family: 'Fraunces', serif;
          font-size: 13px;
          line-height: 1;
          color: ${t.accent};
        }
        .log-glyph.memory { color: ${t.warn}; }
        .log-glyph.cron { color: ${t.success}; }
        .log-glyph.skip { color: ${t.ghost}; }
        .log-glyph.error { color: ${t.danger}; }
        .log-glyph.usage { color: ${t.textFaint}; }
        .log-text { color: ${t.text}; word-break: break-word; }
        .log-sub { color: ${t.textDim}; font-size: 10.5px; }
        .log-channel {
          font-size: 10px;
          color: ${t.textFaint};
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .log-empty {
          padding: 30px 10px;
          text-align: center;
          color: ${t.textFaint};
          font-size: 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }

        /* ── VITALS DRAWER ──────────────────────────────────────── */
        .vital-row {
          display: flex; justify-content: space-between;
          padding: 5px 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
        }
        .vital-row .k { color: ${t.textDim}; }
        .vital-row .v { color: ${t.text}; }
        .vital-cron {
          padding: 10px 12px;
          border: 1px solid ${t.border};
          border-radius: 9px;
          background: ${t.surface};
          margin-bottom: 6px;
        }
        .vital-cron.live {
          border-color: ${t.accent};
          background: ${t.accentWash};
        }
        .vital-cron .d { font-size: 13px; color: ${t.text}; }
        .vital-cron .meta {
          margin-top: 3px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: ${t.textDim};
        }

        /* ── SCROLL FAB ─────────────────────────────────────────── */
        .fab {
          position: fixed;
          bottom: 130px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 22;
          appearance: none;
          width: 34px; height: 34px;
          border-radius: 50%;
          border: 1px solid ${t.border};
          background: ${t.bgElev};
          color: ${t.textDim};
          cursor: pointer;
          display: grid; place-items: center;
          box-shadow: ${t.shadow};
          animation: fadeRise 0.22s ease-out;
          transition: all 0.15s ease;
        }
        .fab:hover { color: ${t.accent}; border-color: ${t.accent}; }

        /* ── RESPONSIVE ─────────────────────────────────────────── */
        @media (max-width: 760px) {
          .hdr-row { padding: 10px 14px; gap: 8px; flex-wrap: wrap; }
          .role { display: none; }
          .state-chips { order: 4; flex-basis: 100%; margin-left: 0; }
          .main-inner { padding: 20px 16px 200px; }
          .dock { padding: 12px 14px 18px; }
          .empty-greet { font-size: 40px; }
          .drawer { width: 100vw; }
          .ribbon-wrap { padding: 0 14px 8px; }
          .iconbtn span:not(.count) { display: none; }
        }
      `}</style>

      <div className="app">

        {/* ── Header ───────────────────────────────── */}
        <header className="hdr">
          <div className="hdr-row">
            <div className={`sigil${loading ? " live" : ""}`} aria-hidden>
              {sigilLetter}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="name">{identity.name}</div>
              {identity.role && <div className="role">{identity.role}</div>}
            </div>

            {snapshot && (
              <div className="state-chips">
                {snapshot.cron.runningIds.length > 0 ? (
                  <span className="chip live" title="A cron job is running">
                    <span className="dot" />
                    {snapshot.cron.runningIds.length} running
                  </span>
                ) : (
                  <span className="chip" title="Active cron schedules">
                    <span className="dot" />
                    {snapshot.cron.active} crons
                  </span>
                )}
                {snapshot.session && (
                  <span
                    className="chip"
                    title={`Session ${snapshot.session.messageCount} of ${snapshot.session.capacity}`}
                  >
                    {snapshot.session.messageCount}/{snapshot.session.capacity}
                  </span>
                )}
                {nextCron && nextCron.nextRun && (
                  <span className="chip hot" title={`Next: ${nextCron.description}`}>
                    {formatCountdown(Date.parse(nextCron.nextRun) - Date.now())}
                  </span>
                )}
              </div>
            )}

            <div className="hdr-spacer" />

            <div className="btn-bar">
              <button
                className={`iconbtn${drawer === "skills" ? " active" : ""}`}
                onClick={() => setDrawer(drawer === "skills" ? null : "skills")}
                aria-label="Skills and MCPs"
                title="Skills & MCPs"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span>Skills</span>
                {snapshot && <span className="count">{snapshot.skills.available}</span>}
              </button>
              <button
                className={`iconbtn${drawer === "logs" ? " active" : ""}`}
                onClick={() => setDrawer(drawer === "logs" ? null : "logs")}
                aria-label="Activity logs"
                title="Activity logs"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="15" y2="12" />
                  <line x1="3" y1="18" x2="18" y2="18" />
                </svg>
                <span>Logs</span>
                {loading && <span className="count" style={{ color: t.accent }}>●</span>}
              </button>
              <button
                className={`iconbtn${drawer === "vitals" ? " active" : ""}`}
                onClick={() => setDrawer(drawer === "vitals" ? null : "vitals")}
                aria-label="Vitals"
                title="Agent vitals"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <span>Vitals</span>
              </button>
            </div>

            <button
              className="iconbtn"
              onClick={clearConversation}
              disabled={loading || messages.length === 0}
              aria-label="Clear conversation"
              title="New (clear visible chat)"
              style={{
                border: `1px solid ${t.border}`,
                background: t.bgElev,
                borderRadius: 9,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>New</span>
            </button>
            <button
              className="iconbtn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              title="Toggle theme"
              style={{
                border: `1px solid ${t.border}`,
                background: t.bgElev,
                borderRadius: 9,
                width: 34,
                justifyContent: "center",
                padding: 0,
              }}
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

          {snapshot && (
            <div className="ribbon-wrap" aria-hidden>
              <span className="ribbon-label">day</span>
              <DayRibbon snapshot={snapshot} theme={t} />
              <span className="ribbon-label">
                {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          )}
        </header>

        {/* ── Main ─────────────────────────────────── */}
        <div className="main" ref={scrollerRef} onScroll={onScroll}>
          <div className="main-inner">
            {messages.length === 0 && (
              <div className="empty">
                <h1 className="empty-greet">
                  {greeting},<br />
                  <em>how can I help?</em>
                </h1>
                {identity.expertise && <p className="empty-sub">{identity.expertise}</p>}
                <div className="empty-hint">
                  <span className="kbd">↵</span> to send · <span className="kbd">⇧↵</span> for newline
                </div>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserMsg key={i} msg={msg} />
              ) : (
                <AssistantMsg
                  key={i}
                  msg={msg}
                  sigilLetter={sigilLetter}
                  copied={copiedIdx === i}
                  onCopy={() => copyMessage(i, msg.content)}
                />
              ),
            )}

            {loading && (
              <div className="running">
                <div className="a-avatar" aria-hidden>{sigilLetter}</div>
                <div className="running-body">
                  <div className="running-head" aria-live="polite">
                    <span className="dots"><span /><span /><span /></span>
                    {activeOp?.kind === "tool" ? (
                      <>
                        <span className="glyph">◆</span>
                        <span className="op-name">{activeOp.name}</span>
                        {activeOp.detail && (
                          <span className="op-detail">{activeOp.detail}</span>
                        )}
                      </>
                    ) : activeOp?.kind === "memory" ? (
                      <>
                        <span className="glyph mem">¶</span>
                        <span className="op-name">reading</span>
                        <span className="op-detail">
                          {activeOp.path}
                          <span className="op-score">· {activeOp.score.toFixed(2)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="op-name">{statusText || "thinking"}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Scroll FAB ───────────────────────────── */}
        {!atBottom && (
          <button className="fab" onClick={scrollToBottom} aria-label="Scroll to bottom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* ── Input Dock ───────────────────────────── */}
        <div className="dock">
          <div className="dock-inner">
            <div className="card">
              <div className="card-row">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={loading ? "thinking…" : `Message ${identity.name}`}
                  disabled={loading}
                  rows={1}
                  className="ta"
                />
                <button
                  className="send"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  aria-label="Send"
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
              <span className="kbd">↵</span> send · <span className="kbd">⇧↵</span> newline
            </div>
          </div>
        </div>

        {/* ── Drawers ──────────────────────────────── */}
        {drawer && (
          <>
            <div className="drawer-backdrop" onClick={() => setDrawer(null)} />
            <div className="drawer" role="dialog" aria-label={drawer}>
              {drawer === "skills" && snapshot && (
                <SkillsDrawer
                  snapshot={snapshot}
                  search={skillSearch}
                  setSearch={setSkillSearch}
                  filtered={filteredSkills}
                  onClose={() => setDrawer(null)}
                />
              )}
              {drawer === "logs" && (
                <LogsDrawer
                  logs={filteredLogs}
                  filter={logFilter}
                  setFilter={setLogFilter}
                  total={logs.length}
                  onClose={() => setDrawer(null)}
                />
              )}
              {drawer === "vitals" && snapshot && (
                <VitalsDrawer snapshot={snapshot} onClose={() => setDrawer(null)} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

function UserMsg({ msg }: { msg: Message }) {
  return (
    <div className="u-wrap">
      <div className="u-msg">{msg.content}</div>
      {(msg.ts || msg.channel === "telegram") && (
        <div className="u-meta">
          {msg.ts && <span>{formatRelativeTime(msg.ts)}</span>}
          {msg.channel === "telegram" && <span className="tg">◇ telegram</span>}
        </div>
      )}
    </div>
  );
}

function AssistantMsg({
  msg,
  sigilLetter,
  copied,
  onCopy,
}: {
  msg: Message;
  sigilLetter: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const uniqueTools = useMemo(() => {
    if (!msg.tools) return [];
    const seen = new Set<string>();
    return msg.tools.filter((tc) => {
      if (seen.has(tc.name)) return false;
      seen.add(tc.name);
      return true;
    });
  }, [msg.tools]);

  const uniqueHits = useMemo(() => {
    if (!msg.memoryHits) return [];
    const seen = new Set<string>();
    return msg.memoryHits.filter((h) => {
      if (seen.has(h.path)) return false;
      seen.add(h.path);
      return true;
    });
  }, [msg.memoryHits]);

  const totalTokens = msg.usage ? msg.usage.inputTokens + msg.usage.outputTokens : 0;

  return (
    <div className="a-wrap">
      <div className="a-avatar">{sigilLetter}</div>
      <div>
        <div className="a-body">
          <div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        </div>

        {(uniqueTools.length > 0 || uniqueHits.length > 0 || msg.usage || msg.ts) && (
          <div className="meta-row">
            {uniqueTools.slice(0, 5).map((tc) => (
              <span key={tc.name} className="pill tool" title={tc.name}>
                <span className="glyph">◆</span>
                {prettyToolName(tc.name)}
              </span>
            ))}
            {uniqueTools.length > 5 && (
              <span className="pill tool">+{uniqueTools.length - 5}</span>
            )}
            {uniqueHits.slice(0, 3).map((h) => (
              <span
                key={h.path}
                className="pill mem"
                title={`${h.heading} · score ${h.score.toFixed(2)}`}
              >
                <span className="glyph">¶</span>
                {stemPath(h.path)}
              </span>
            ))}
            {uniqueHits.length > 3 && (
              <span className="pill mem">+{uniqueHits.length - 3}</span>
            )}
            {msg.usage && (
              <span className="pill cost" title="Tokens · cost">
                {formatTokens(totalTokens)}
                {msg.usage.costUsd > 0 && ` · $${msg.usage.costUsd.toFixed(3)}`}
              </span>
            )}
            <button className="copy-inline" onClick={onCopy} aria-label="Copy">
              {copied ? "copied" : "copy"}
            </button>
            {msg.ts && (
              <span className="time-stamp">
                {formatRelativeTime(msg.ts)}
                {msg.channel === "telegram" && " · telegram"}
                {msg.channel === "cron" && " · cron"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DayRibbon({ snapshot, theme: th }: { snapshot: StateSnapshot; theme: ThemeDef }) {
  const now = Date.now();
  const startMs = snapshot.today.startMs;
  const HOURS = 24;
  const cells = new Array(HOURS).fill(0).map(() => ({ chat: 0, telegram: 0, cron: 0 }));

  for (const e of snapshot.today.events) {
    const hr = Math.floor((e.at - startMs) / 3_600_000);
    if (hr < 0 || hr >= HOURS) continue;
    cells[hr][e.kind]++;
  }

  const nowHour = Math.floor((now - startMs) / 3_600_000);
  const nowOffset = Math.min(HOURS, Math.max(0, (now - startMs) / 3_600_000));

  return (
    <div className="ribbon" role="presentation">
      {cells.map((c, i) => {
        const total = c.chat + c.telegram + c.cron;
        const isFuture = i > nowHour;
        const hasCron = c.cron > 0;
        const hasTg = c.telegram > 0;
        const hasChat = c.chat > 0;

        let background: string;
        if (isFuture) background = th.surface;
        else if (total === 0) background = th.border;
        else if (hasCron && !hasChat && !hasTg) background = th.warn;
        else if (hasTg && !hasChat) background = th.accentDim;
        else background = th.accent;

        const opacity = isFuture ? 0.3 : total === 0 ? 0.45 : Math.min(1, 0.55 + total * 0.15);

        const title = isFuture
          ? `${i}:00 — upcoming`
          : total === 0
          ? `${i}:00 — quiet`
          : `${i}:00 — ${c.chat ? `${c.chat} chat ` : ""}${c.telegram ? `${c.telegram} tg ` : ""}${c.cron ? `${c.cron} cron` : ""}`.trim();

        return (
          <div
            key={i}
            className="ribbon-cell"
            style={{ background, opacity }}
            title={title}
          />
        );
      })}
      <div
        className="ribbon-now"
        style={{ left: `calc(${(nowOffset / HOURS) * 100}% - 0.75px)` }}
      />
    </div>
  );
}

function DrawerHeader({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
}) {
  return (
    <div className="drawer-hdr">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <button className="x-btn" onClick={onClose} aria-label="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function SkillsDrawer({
  snapshot,
  search,
  setSearch,
  filtered,
  onClose,
}: {
  snapshot: StateSnapshot;
  search: string;
  setSearch: (s: string) => void;
  filtered: SkillItem[];
  onClose: () => void;
}) {
  const mcps = snapshot.mcp;
  return (
    <>
      <DrawerHeader
        title="Skills & MCPs"
        sub={`${snapshot.skills.available} of ${snapshot.skills.total} available · ${mcps.filter((m) => m.status === "active").length} mcp active`}
        onClose={onClose}
      />
      <div className="drawer-body">
        <div className="drawer-section-head">MCP Servers</div>
        {mcps.map((m) => (
          <div key={m.name} className="mcp-item">
            <span className={`mcp-dot ${m.status === "active" ? "on" : "off"}`} />
            <span className="mcp-name">{m.name}</span>
            {m.status === "inactive" && m.reason && (
              <span className="mcp-reason">{m.reason}</span>
            )}
          </div>
        ))}

        <div className="drawer-section-head" style={{ marginTop: 24 }}>
          Skills ({filtered.length})
        </div>
        <input
          className="skill-search"
          placeholder="Filter skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtered.map((s) => (
          <div key={s.name} className={`skill-item${!s.requirementsMet ? " unmet" : ""}`}>
            <div className="skill-item-head">
              <span
                className={`skill-item-dot ${s.requirementsMet ? "ok" : "warn"}`}
                title={s.requirementsMet ? "ready" : "unmet requirements"}
              />
              <span className="skill-item-name">{s.name}</span>
              <span className="skill-loc">{s.location}</span>
            </div>
            <div className="skill-item-desc">{s.description}</div>
            {!s.requirementsMet && s.unmetRequirements && s.unmetRequirements.length > 0 && (
              <div className="skill-item-unmet">
                needs: {s.unmetRequirements.join(", ")}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="log-empty">no skills match</div>
        )}
      </div>
    </>
  );
}

function LogsDrawer({
  logs,
  filter,
  setFilter,
  total,
  onClose,
}: {
  logs: LogEvent[];
  filter: "all" | "tool" | "memory" | "cron" | "error";
  setFilter: (f: "all" | "tool" | "memory" | "cron" | "error") => void;
  total: number;
  onClose: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinToBottom, setPinToBottom] = useState(true);

  useEffect(() => {
    if (pinToBottom && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [logs, pinToBottom]);

  const reversed = [...logs].reverse();

  return (
    <>
      <DrawerHeader
        title="Activity Logs"
        sub={`${total} event${total === 1 ? "" : "s"} in buffer · live`}
        onClose={onClose}
      />
      <div style={{ padding: "12px 20px 0" }}>
        <div className="log-filters">
          {(["all", "tool", "memory", "cron", "error"] as const).map((f) => (
            <button
              key={f}
              className={`log-filter-btn${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
          <button
            className={`log-filter-btn${pinToBottom ? " active" : ""}`}
            onClick={() => setPinToBottom((v) => !v)}
            style={{ marginLeft: "auto" }}
            title="Stay pinned to the latest event"
          >
            {pinToBottom ? "tail ●" : "tail"}
          </button>
        </div>
      </div>
      <div className="drawer-body" ref={scrollerRef}>
        {reversed.length === 0 ? (
          <div className="log-empty">no events yet — send a message or wait for a cron to fire</div>
        ) : (
          reversed.map((e) => <LogRow key={e.seq} event={e} />)
        )}
      </div>
    </>
  );
}

function LogRow({ event }: { event: LogEvent }) {
  const channel = friendlyChannel(event.userId);

  let glyph = "◆";
  let glyphClass = "";
  let text: React.ReactNode = null;
  let sub: string | null = null;

  if (event.kind === "tool") {
    glyph = "◆";
    const name = event.payload.name as string | undefined;
    text = <span>{prettyToolName(name ?? "tool")}</span>;
  } else if (event.kind === "memory") {
    glyph = "¶";
    glyphClass = "memory";
    const p = event.payload.path as string;
    const s = event.payload.score as number;
    text = <span>{stemPath(p)}</span>;
    sub = `score ${s.toFixed(2)}`;
  } else if (event.kind === "cron_fire") {
    glyph = "▲";
    glyphClass = "cron";
    text = <span>{(event.payload.description as string) ?? "cron"}</span>;
    sub = (event.payload.schedule as string) ?? "";
  } else if (event.kind === "cron_skip") {
    glyph = "▽";
    glyphClass = "skip";
    text = <span>skip: {(event.payload.description as string) ?? "cron"}</span>;
    sub = (event.payload.reason as string) ?? "";
  } else if (event.kind === "usage") {
    glyph = "$";
    glyphClass = "usage";
    const it = event.payload.inputTokens as number;
    const ot = event.payload.outputTokens as number;
    const cost = event.payload.costUsd as number;
    text = <span>{formatTokens(it + ot)} tokens</span>;
    sub = cost > 0 ? `$${cost.toFixed(4)}` : null;
  } else if (event.kind === "error") {
    glyph = "!";
    glyphClass = "error";
    text = <span>{(event.payload.message as string) ?? "error"}</span>;
  } else {
    text = <span>{event.kind}</span>;
  }

  return (
    <div className="log-row">
      <span className="log-time">{formatClock(event.at)}</span>
      <span className={`log-glyph ${glyphClass}`}>{glyph}</span>
      <span className="log-text">
        {text}
        {sub && <div className="log-sub">{sub}</div>}
      </span>
      {channel && <span className="log-channel">{channel.label}</span>}
    </div>
  );
}

function VitalsDrawer({
  snapshot,
  onClose,
}: {
  snapshot: StateSnapshot;
  onClose: () => void;
}) {
  return (
    <>
      <DrawerHeader
        title="Vitals"
        sub="session · memory · skills · cron"
        onClose={onClose}
      />
      <div className="drawer-body">
        <div className="drawer-section-head">Session</div>
        {snapshot.session ? (
          <>
            <div className="vital-row">
              <span className="k">messages</span>
              <span className="v">
                {snapshot.session.messageCount} / {snapshot.session.capacity}
              </span>
            </div>
            <div className="vital-row">
              <span className="k">last activity</span>
              <span className="v">{formatCountdown(snapshot.session.ageMs)} ago</span>
            </div>
          </>
        ) : (
          <div className="vital-row">
            <span className="k">status</span>
            <span className="v">fresh</span>
          </div>
        )}

        <div className="drawer-section-head">Memory</div>
        <div className="vital-row">
          <span className="k">files</span>
          <span className="v">{snapshot.memory.files}</span>
        </div>
        <div className="vital-row">
          <span className="k">size</span>
          <span className="v">{(snapshot.memory.totalBytes / 1024).toFixed(1)} KB</span>
        </div>
        {snapshot.memory.lastWrite && (
          <div className="vital-row">
            <span className="k">last write</span>
            <span className="v">{formatRelativeTime(Date.parse(snapshot.memory.lastWrite))}</span>
          </div>
        )}

        <div className="drawer-section-head">Skills</div>
        <div className="vital-row">
          <span className="k">available</span>
          <span className="v">{snapshot.skills.available} / {snapshot.skills.total}</span>
        </div>

        <div className="drawer-section-head">
          Cron ({snapshot.cron.active})
        </div>
        {snapshot.cron.jobs.length === 0 && (
          <div className="vital-row">
            <span className="k">none scheduled</span>
            <span className="v" />
          </div>
        )}
        {snapshot.cron.jobs.map((j) => (
          <div key={j.id} className={`vital-cron${j.running ? " live" : ""}`}>
            <div className="d">{j.description}</div>
            <div className="meta">
              {j.schedule}
              {j.nextRun && <> · next {formatCountdown(Date.parse(j.nextRun) - Date.now())}</>}
              {j.lastRun && <> · last {formatRelativeTime(Date.parse(j.lastRun))}</>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

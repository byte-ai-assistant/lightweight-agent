// Rolling in-memory event log for the UI's Logs drawer.
// Capped; oldest entries drop off. Events carry a monotonic seq for polling.

export type LogEventKind =
  | "tool"
  | "memory"
  | "usage"
  | "cron_fire"
  | "cron_skip"
  | "error"
  | "status";

export interface LogEvent {
  seq: number;
  at: number;
  kind: LogEventKind;
  userId?: string;
  payload: Record<string, unknown>;
}

const MAX_EVENTS = 300;

let nextSeq = 1;
const buffer: LogEvent[] = [];

export function pushEvent(
  kind: LogEventKind,
  payload: Record<string, unknown>,
  userId?: string,
): LogEvent {
  const evt: LogEvent = {
    seq: nextSeq++,
    at: Date.now(),
    kind,
    userId,
    payload,
  };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) {
    buffer.splice(0, buffer.length - MAX_EVENTS);
  }
  return evt;
}

export function getEventsSince(sinceSeq: number | undefined, limit = 200): LogEvent[] {
  const slice = sinceSeq && sinceSeq > 0
    ? buffer.filter((e) => e.seq > sinceSeq)
    : buffer.slice(-limit);
  return slice.slice(-limit);
}

export function getLatestSeq(): number {
  return nextSeq - 1;
}

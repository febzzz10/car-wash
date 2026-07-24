import type { TimerEventType, WashJobStatus } from "@washpro/contracts";

export interface TimerEventInput {
  readonly type: TimerEventType;
  readonly at: string;
}

export interface TimerResult {
  readonly activeSeconds: number;
  readonly pausedSeconds: number;
  readonly running: boolean;
  readonly ended: boolean;
  readonly currentIntervalStartedAt: string | null;
}

type TimerState = "NOT_STARTED" | "RUNNING" | "PAUSED" | "ENDED";

function secondsBetween(start: number, end: number): number {
  if (end < start) throw new Error("Timer events must be chronological.");
  return Math.floor((end - start) / 1_000);
}

export function calculateTimer(
  events: readonly TimerEventInput[],
  now = new Date().toISOString(),
): TimerResult {
  let state: TimerState = "NOT_STARTED";
  let activeSeconds = 0;
  let pausedSeconds = 0;
  let intervalStartedAt: number | null = null;

  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at))
      throw new Error("Timer event timestamp is invalid.");

    if (event.type === "START" && state === "NOT_STARTED") {
      state = "RUNNING";
      intervalStartedAt = at;
    } else if (
      event.type === "PAUSE" &&
      state === "RUNNING" &&
      intervalStartedAt !== null
    ) {
      activeSeconds += secondsBetween(intervalStartedAt, at);
      state = "PAUSED";
      intervalStartedAt = at;
    } else if (
      event.type === "RESUME" &&
      state === "PAUSED" &&
      intervalStartedAt !== null
    ) {
      pausedSeconds += secondsBetween(intervalStartedAt, at);
      state = "RUNNING";
      intervalStartedAt = at;
    } else if (
      event.type === "END" &&
      (state === "RUNNING" || state === "PAUSED") &&
      intervalStartedAt !== null
    ) {
      if (state === "RUNNING")
        activeSeconds += secondsBetween(intervalStartedAt, at);
      else pausedSeconds += secondsBetween(intervalStartedAt, at);
      state = "ENDED";
      intervalStartedAt = null;
    } else {
      throw new Error("Invalid timer transition.");
    }
  }

  if (intervalStartedAt !== null && state !== "ENDED") {
    const nowValue = Date.parse(now);
    if (!Number.isFinite(nowValue))
      throw new Error("Current timestamp is invalid.");
    if (state === "RUNNING")
      activeSeconds += secondsBetween(intervalStartedAt, nowValue);
    if (state === "PAUSED")
      pausedSeconds += secondsBetween(intervalStartedAt, nowValue);
  }

  return {
    activeSeconds,
    pausedSeconds,
    running: state === "RUNNING",
    ended: state === "ENDED",
    currentIntervalStartedAt:
      intervalStartedAt === null
        ? null
        : new Date(intervalStartedAt).toISOString(),
  };
}

export type JobAction =
  "QUEUE" | "START" | "PAUSE" | "RESUME" | "END" | "CANCEL";

const TRANSITIONS: Readonly<Record<string, WashJobStatus>> = {
  "DRAFT:QUEUE": "WAITING",
  "DRAFT:CANCEL": "CANCELLED",
  "WAITING:START": "IN_PROGRESS",
  "WAITING:CANCEL": "CANCELLED",
  "IN_PROGRESS:PAUSE": "PAUSED",
  "IN_PROGRESS:END": "COMPLETED",
  "IN_PROGRESS:CANCEL": "CANCELLED",
  "PAUSED:RESUME": "IN_PROGRESS",
  "PAUSED:END": "COMPLETED",
  "PAUSED:CANCEL": "CANCELLED",
};

export function getNextStatus(
  status: WashJobStatus,
  action: JobAction,
): WashJobStatus {
  const next = TRANSITIONS[`${status}:${action}`];
  if (next === undefined) throw new Error("Invalid job status transition.");
  return next;
}

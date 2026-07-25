import { describe, expect, it } from "vitest";

import { liveTimer } from "./wash-job-detail";

describe("liveTimer", () => {
  it("returns zero elapsed when there are no events", () => {
    expect(liveTimer([], 0)).toEqual({ active: 0, paused: 0 });
  });

  it("returns active elapsed from a single START event", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const now = new Date("2025-01-01T10:05:30Z").getTime();
    expect(
      liveTimer(
        [{ event_type: "START", event_at: new Date(start).toISOString() }],
        now,
      ),
    ).toEqual({ active: 330, paused: 0 });
  });

  it("subtracts paused duration from active", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const pause = new Date("2025-01-01T10:10:00Z").getTime();
    const resume = new Date("2025-01-01T10:15:00Z").getTime();
    const now = new Date("2025-01-01T10:20:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(pause).toISOString() },
        { event_type: "RESUME", event_at: new Date(resume).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(900); // 15 min active (10 to 10:10 + 10:15 to 10:20)
    expect(result.paused).toBe(0); // no current pause
  });

  it("reports paused duration when currently paused", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const pause = new Date("2025-01-01T10:10:00Z").getTime();
    const now = new Date("2025-01-01T10:20:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(pause).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(600); // 10 min active, frozen at pause
    expect(result.paused).toBe(600); // 10 min currently paused
  });

  it("freezes at END event", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const end = new Date("2025-01-01T10:25:00Z").getTime();
    const now = new Date("2025-01-01T10:30:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "END", event_at: new Date(end).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(1500); // 25 min, frozen at end
    expect(result.paused).toBe(0);
  });

  it("handles multiple pause-resume cycles", () => {
    const start = new Date("2025-01-01T10:00:00Z").getTime();
    const p1 = new Date("2025-01-01T10:10:00Z").getTime();
    const r1 = new Date("2025-01-01T10:15:00Z").getTime();
    const p2 = new Date("2025-01-01T10:20:00Z").getTime();
    const r2 = new Date("2025-01-01T10:25:00Z").getTime();
    const now = new Date("2025-01-01T10:30:00Z").getTime();
    const result = liveTimer(
      [
        { event_type: "START", event_at: new Date(start).toISOString() },
        { event_type: "PAUSE", event_at: new Date(p1).toISOString() },
        { event_type: "RESUME", event_at: new Date(r1).toISOString() },
        { event_type: "PAUSE", event_at: new Date(p2).toISOString() },
        { event_type: "RESUME", event_at: new Date(r2).toISOString() },
      ],
      now,
    );
    expect(result.active).toBe(1200); // 20 min active total
    expect(result.paused).toBe(0); // not currently paused
  });
});

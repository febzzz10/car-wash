import { describe, expect, it } from "vitest";

import { calculateTimer, getNextStatus } from "./timers";

describe("wash timer", () => {
  it("excludes paused intervals and reconstructs a running timer", () => {
    const result = calculateTimer(
      [
        { type: "START", at: "2026-07-23T10:00:00.000Z" },
        { type: "PAUSE", at: "2026-07-23T10:10:00.000Z" },
        { type: "RESUME", at: "2026-07-23T10:15:00.000Z" },
      ],
      "2026-07-23T10:25:00.000Z",
    );

    expect(result.activeSeconds).toBe(1_200);
    expect(result.pausedSeconds).toBe(300);
    expect(result.running).toBe(true);
  });

  it("rejects duplicate and out-of-order timer events", () => {
    expect(() =>
      calculateTimer([
        { type: "START", at: "2026-07-23T10:00:00.000Z" },
        { type: "START", at: "2026-07-23T10:01:00.000Z" },
      ]),
    ).toThrow("Invalid timer transition");
  });

  it("enforces documented job status transitions", () => {
    expect(getNextStatus("DRAFT", "QUEUE")).toBe("WAITING");
    expect(getNextStatus("WAITING", "START")).toBe("IN_PROGRESS");
    expect(getNextStatus("IN_PROGRESS", "PAUSE")).toBe("PAUSED");
    expect(getNextStatus("PAUSED", "RESUME")).toBe("IN_PROGRESS");
    expect(getNextStatus("PAUSED", "END")).toBe("COMPLETED");
    expect(() => getNextStatus("COMPLETED", "START")).toThrow(
      "Invalid job status transition",
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { configureFormatting, dateTime, money } from "./format";

describe("business formatting preferences", () => {
  afterEach(() => configureFormatting(null));

  it("uses the session currency and number locale", () => {
    configureFormatting({ currency: "USD", locale: "en-US" });

    expect(money(1234)).toBe("$12.34");
  });

  it("uses the configured timezone and tolerates invalid settings", () => {
    configureFormatting({
      dateFormat: "YYYY-MM-DD",
      timeZone: "UTC",
    });
    expect(dateTime("2026-01-02T03:04:00.000Z")).toMatch(/3:04/i);

    configureFormatting({ locale: "not-a-locale", timeZone: "Mars/Olympus" });
    expect(() => money(100)).not.toThrow();
    expect(() => dateTime("2026-01-02T03:04:00.000Z")).not.toThrow();
  });
});

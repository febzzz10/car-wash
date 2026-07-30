import { afterEach, describe, expect, it } from "vitest";

import { configureFormatting, dateTime, money, parseDecimalToMinor } from "./format";

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

describe("parseDecimalToMinor", () => {
  it("12.34 → 1234", () => expect(parseDecimalToMinor("12.34")).toBe(1234));
  it("12.3 → 1230", () => expect(parseDecimalToMinor("12.3")).toBe(1230));
  it("12 → 1200", () => expect(parseDecimalToMinor("12")).toBe(1200));
  it("0 → 0", () => expect(parseDecimalToMinor("0")).toBe(0));
  it("0.00 → 0", () => expect(parseDecimalToMinor("0.00")).toBe(0));
  it("0.01 → 1", () => expect(parseDecimalToMinor("0.01")).toBe(1));
  it("00.50 → 50", () => expect(parseDecimalToMinor("00.50")).toBe(50));
  it("01.20 → 120", () => expect(parseDecimalToMinor("01.20")).toBe(120));
  it("rejects 3 decimal places", () => expect(() => parseDecimalToMinor("12.345")).toThrow());
  it("rejects negative", () => expect(() => parseDecimalToMinor("-5")).toThrow());
  it("rejects empty", () => expect(() => parseDecimalToMinor("")).toThrow());
  it("rejects whitespace only", () => expect(() => parseDecimalToMinor("   ")).toThrow());
  it("rejects letters", () => expect(() => parseDecimalToMinor("abc")).toThrow());
  it("rejects comma", () => expect(() => parseDecimalToMinor("1,234")).toThrow());
  it("rejects currency symbol", () => expect(() => parseDecimalToMinor("$12.34")).toThrow());
  it("trims surrounding whitespace", () => expect(parseDecimalToMinor("  12.34  ")).toBe(1234));
  it("rejects unsafe integer", () => expect(() => parseDecimalToMinor("9007199254740992")).toThrow());
});

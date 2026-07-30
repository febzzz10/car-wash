import { afterEach, describe, expect, it } from "vitest";

import { configureFormatting, dateTime, formatCurrencyCode, isFiniteMinorAmount, money, parseDecimalToMinor } from "./format";

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

describe("safe currency formatter", () => {
  afterEach(() => configureFormatting(null));

  it("formats valid INR without error", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(80000)).toBe("₹800.00");
  });

  it("formats valid USD without error", () => {
    configureFormatting({ currency: "USD", locale: "en-US" });
    expect(money(1234)).toBe("$12.34");
  });

  it("does not throw on invalid ₹ (rupee sign), falls back to INR", () => {
    configureFormatting({ currency: "₹", locale: "en-IN" });
    expect(() => money(80000)).not.toThrow();
    expect(money(80000)).toBe("₹800.00");
  });

  it("falls back to INR for completely invalid currency", () => {
    configureFormatting({ currency: "NOTACODE", locale: "en-IN" });
    expect(() => money(50000)).not.toThrow();
    expect(money(50000)).toBe("₹500.00");
  });

  it("falls back to INR for empty currency", () => {
    configureFormatting({ currency: "", locale: "en-IN" });
    expect(() => money(10000)).not.toThrow();
    expect(money(10000)).toBe("₹100.00");
  });

  it("formats minor-unit amounts correctly with INR", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(0)).toBe("₹0.00");
    expect(money(1)).toBe("₹0.01");
    expect(money(100)).toBe("₹1.00");
    expect(money(123456)).toBe("₹1,234.56");
  });

  it("formatCurrencyCode returns preview for valid codes", () => {
    expect(formatCurrencyCode("INR")).toContain("1,234");
    expect(formatCurrencyCode("USD")).toContain("1,234");
  });

  it("formatCurrencyCode returns fallback for invalid codes", () => {
    expect(() => formatCurrencyCode("₹")).not.toThrow();
    expect(formatCurrencyCode("₹")).toContain("1,234");
  });

  it("inherits default INR when configured with legacy invalid value", () => {
    configureFormatting({ currency: "₹", locale: "en-IN" });
    expect(money(0)).toBe("₹0.00");
  });

  it("configuring with valid INR does not throw during dashboard render", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(50000)).toBe("₹500.00");
  });
});

describe("isFiniteMinorAmount", () => {
  it("returns true for a normal integer", () => {
    expect(isFiniteMinorAmount(1234)).toBe(true);
  });

  it("returns true for zero", () => {
    expect(isFiniteMinorAmount(0)).toBe(true);
  });

  it("returns false for NaN", () => {
    expect(isFiniteMinorAmount(NaN)).toBe(false);
  });

  it("returns false for Infinity", () => {
    expect(isFiniteMinorAmount(Infinity)).toBe(false);
  });

  it("returns false for -Infinity", () => {
    expect(isFiniteMinorAmount(-Infinity)).toBe(false);
  });
});

describe("money defensive guards", () => {
  afterEach(() => configureFormatting(null));

  it("returns — for NaN", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(NaN)).toBe("—");
  });

  it("returns — for undefined", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(undefined)).toBe("—");
  });

  it("returns — for null", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(null)).toBe("—");
  });

  it("returns — for Infinity", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(Infinity)).toBe("—");
  });

  it("still formats normal valid numbers correctly", () => {
    configureFormatting({ currency: "INR", locale: "en-IN" });
    expect(money(80000)).toBe("₹800.00");
  });
});

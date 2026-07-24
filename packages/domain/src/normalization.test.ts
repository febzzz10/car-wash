import { describe, expect, it } from "vitest";

import {
  normalizeCode,
  normalizeEmail,
  normalizeNameSearch,
  normalizePhone,
  normalizeRegistration,
} from "./normalization";

describe("normalization", () => {
  it("normalizes Indian phone numbers to an E.164-style value", () => {
    expect(normalizePhone("09876 543210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
  });

  it("rejects an unusable phone number", () => {
    expect(() => normalizePhone("123")).toThrow("valid phone");
  });

  it("normalizes registration display and uniqueness keys", () => {
    expect(normalizeRegistration(" kl-24  ab 1234 ")).toEqual({
      display: "KL 24 AB 1234",
      search: "KL24AB1234",
    });
  });

  it("normalizes searchable text and codes", () => {
    expect(normalizeEmail("  Owner@WashPro.IN ")).toBe("owner@washpro.in");
    expect(normalizeNameSearch("  Anu   Joseph ")).toBe("anu joseph");
    expect(normalizeCode(" wash 20 ")).toBe("WASH20");
  });
});

import { describe, expect, it } from "vitest";
import { maskPhoneNumber } from "./masking";

describe("maskPhoneNumber", () => {
  it("masks the middle digits of a 10-digit number", () => {
    expect(maskPhoneNumber("8086383391")).toBe("80xxxxxx91");
  });

  it("masks the middle digits of another 10-digit number", () => {
    expect(maskPhoneNumber("9876543210")).toBe("98xxxxxx10");
  });

  it("uses a dynamic number of x characters matching the hidden digits", () => {
    expect(maskPhoneNumber("8000000091")).toBe("80xxxxxx91");
    expect(maskPhoneNumber("1234567")).toBe("12xxx67");
    expect(maskPhoneNumber("12345678")).toBe("12xxxx78");
    expect(maskPhoneNumber("123456789")).toBe("12xxxxx89");
    expect(maskPhoneNumber("123456789012")).toBe("12xxxxxxxx12");
  });

  it("preserves +91 prefix and masks the 10-digit local number", () => {
    expect(maskPhoneNumber("+919002005005")).toBe("+91 90xxxxxx05");
    expect(maskPhoneNumber("+918086383391")).toBe("+91 80xxxxxx91");
  });

  it("handles +91 with internal spaces, preserving the prefix", () => {
    expect(maskPhoneNumber("+91 90020 05005")).toBe("+91 90xxxxxx05");
  });

  it("returns already-masked input unchanged", () => {
    expect(maskPhoneNumber("90xxxxxx05")).toBe("90xxxxxx05");
    expect(maskPhoneNumber("+91 90xxxxxx05")).toBe("+91 90xxxxxx05");
    expect(maskPhoneNumber("80xxxxxx91")).toBe("80xxxxxx91");
  });

  it("returns an empty string for null", () => {
    expect(maskPhoneNumber(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(maskPhoneNumber(undefined)).toBe("");
  });

  it("returns an empty string for an empty string", () => {
    expect(maskPhoneNumber("")).toBe("");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(maskPhoneNumber("   ")).toBe("");
  });

  it("returns short malformed legacy values untouched", () => {
    expect(maskPhoneNumber("123")).toBe("123");
    expect(maskPhoneNumber("12")).toBe("12");
  });

  it("returns non-numeric malformed legacy values untouched", () => {
    expect(maskPhoneNumber("abc")).toBe("abc");
  });

  it("handles exactly four digits without masking", () => {
    expect(maskPhoneNumber("1234")).toBe("1234");
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskPhoneNumber(" 8086383391 ")).toBe("80xxxxxx91");
  });
});
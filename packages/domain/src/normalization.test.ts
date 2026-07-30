import { describe, expect, it } from "vitest";

import {
  normalizeCode,
  normalizeEmail,
  normalizeNameSearch,
  normalizePhone,
  normalizeRegistration,
  normalizeVehicleMake,
  normalizeVehicleModel,
  validateCurrencyCode,
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

  it("normalizes vehicle make display and deduplication values", () => {
    expect(normalizeVehicleMake("  Tata  ")).toEqual({
      name: "Tata",
      normalizedName: "tata",
    });
    expect(normalizeVehicleMake("Maruti   Suzuki")).toEqual({
      name: "Maruti Suzuki",
      normalizedName: "maruti suzuki",
    });
    expect(normalizeVehicleMake("   ")).toBeNull();
    expect(normalizeVehicleMake("")).toBeNull();
    expect(normalizeVehicleMake("Hyundai")).toEqual({
      name: "Hyundai",
      normalizedName: "hyundai",
    });
    expect(normalizeVehicleMake("BMW")).toEqual({
      name: "BMW",
      normalizedName: "bmw",
    });
    expect(normalizeVehicleMake("Land Rover")).toEqual({
      name: "Land Rover",
      normalizedName: "land rover",
    });
  });

  it("normalizes vehicle model display and deduplication values", () => {
    expect(normalizeVehicleModel("  WagonR  ")).toEqual({
      name: "WagonR",
      normalizedName: "wagonr",
    });
    expect(normalizeVehicleModel("Range   Rover")).toEqual({
      name: "Range Rover",
      normalizedName: "range rover",
    });
    expect(normalizeVehicleModel("   ")).toBeNull();
    expect(normalizeVehicleModel("")).toBeNull();
    expect(normalizeVehicleModel("i20")).toEqual({
      name: "i20",
      normalizedName: "i20",
    });
    expect(normalizeVehicleModel("XUV700")).toEqual({
      name: "XUV700",
      normalizedName: "xuv700",
    });
    expect(normalizeVehicleModel("WR-V")).toEqual({
      name: "WR-V",
      normalizedName: "wr-v",
    });
    expect(normalizeVehicleModel("3 Series")).toEqual({
      name: "3 Series",
      normalizedName: "3 series",
    });
    expect(normalizeVehicleModel("Model S")).toEqual({
      name: "Model S",
      normalizedName: "model s",
    });
    expect(normalizeVehicleModel("C-Class")).toEqual({
      name: "C-Class",
      normalizedName: "c-class",
    });
  });
});

describe("validateCurrencyCode", () => {
  it("accepts INR", () => {
    const result = validateCurrencyCode("INR");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.currency).toBe("INR");
  });

  it("normalizes lowercase inr to INR", () => {
    const result = validateCurrencyCode("inr");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.currency).toBe("INR");
  });

  it("trims whitespace around INR", () => {
    const result = validateCurrencyCode("  INR  ");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.currency).toBe("INR");
  });

  it("accepts USD", () => {
    const result = validateCurrencyCode("USD");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.currency).toBe("USD");
  });

  it("accepts EUR", () => {
    const result = validateCurrencyCode("EUR");
    expect(result.valid).toBe(true);
  });

  it("accepts GBP", () => {
    const result = validateCurrencyCode("GBP");
    expect(result.valid).toBe(true);
  });

  it("accepts AED", () => {
    const result = validateCurrencyCode("AED");
    expect(result.valid).toBe(true);
  });

  it("accepts SAR", () => {
    const result = validateCurrencyCode("SAR");
    expect(result.valid).toBe(true);
  });

  it("rejects ₹ (rupee sign)", () => {
    const result = validateCurrencyCode("₹");
    expect(result.valid).toBe(false);
  });

  it("rejects $ (dollar sign)", () => {
    const result = validateCurrencyCode("$");
    expect(result.valid).toBe(false);
  });

  it("rejects 'Rupees' (word, not code)", () => {
    const result = validateCurrencyCode("Rupees");
    expect(result.valid).toBe(false);
  });

  it("rejects 'inr123' (too long)", () => {
    const result = validateCurrencyCode("inr123");
    expect(result.valid).toBe(false);
  });

  it("rejects empty string", () => {
    const result = validateCurrencyCode("");
    expect(result.valid).toBe(false);
  });

  it("rejects 'XYZ' (unsupported three-letter code)", () => {
    const result = validateCurrencyCode("XYZ");
    expect(result.valid).toBe(false);
  });
});

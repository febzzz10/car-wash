import { describe, expect, it } from "vitest";

import {
  normalizeCode,
  normalizeEmail,
  normalizeNameSearch,
  normalizePhone,
  normalizeRegistration,
  normalizeVehicleModel,
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

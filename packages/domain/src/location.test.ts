import { describe, expect, it } from "vitest";

import { distanceMeters, verifyLocation } from "./location";

describe("location verification", () => {
  it("calculates short geodesic distances", () => {
    expect(
      Math.round(
        distanceMeters(
          { latitude: 9.9312, longitude: 76.2673 },
          { latitude: 9.9321, longitude: 76.2673 },
        ),
      ),
    ).toBe(100);
  });

  it("prioritizes poor accuracy before radius verification", () => {
    expect(
      verifyLocation({
        captured: { latitude: 9.9312, longitude: 76.2673, accuracyMeters: 120 },
        business: { latitude: 9.9312, longitude: 76.2673 },
        allowedRadiusMeters: 100,
        maximumAccuracyMeters: 50,
      }),
    ).toMatchObject({ status: "POOR_ACCURACY" });
  });

  it("reports inside and outside distances", () => {
    expect(
      verifyLocation({
        captured: { latitude: 9.9312, longitude: 76.2673, accuracyMeters: 10 },
        business: { latitude: 9.9312, longitude: 76.2673 },
        allowedRadiusMeters: 100,
        maximumAccuracyMeters: 50,
      }),
    ).toMatchObject({ status: "AT_BUSINESS_LOCATION", distanceMeters: 0 });
    expect(
      verifyLocation({
        captured: { latitude: 9.9412, longitude: 76.2673, accuracyMeters: 10 },
        business: { latitude: 9.9312, longitude: 76.2673 },
        allowedRadiusMeters: 100,
        maximumAccuracyMeters: 50,
      }),
    ).toMatchObject({ status: "OUTSIDE_BUSINESS_LOCATION" });
  });
});

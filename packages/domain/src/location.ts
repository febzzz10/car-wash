import type { LocationStatus } from "@washpro/contracts";

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface CapturedCoordinates extends Coordinates {
  readonly accuracyMeters: number;
}

export interface LocationVerificationInput {
  readonly captured: CapturedCoordinates;
  readonly business: Coordinates;
  readonly allowedRadiusMeters: number;
  readonly maximumAccuracyMeters: number;
}

export interface LocationVerificationResult {
  readonly status: LocationStatus;
  readonly distanceMeters: number;
  readonly accuracyMeters: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function verifyLocation(
  input: LocationVerificationInput,
): LocationVerificationResult {
  const distance = distanceMeters(input.captured, input.business);
  if (input.captured.accuracyMeters > input.maximumAccuracyMeters) {
    return {
      status: "POOR_ACCURACY",
      distanceMeters: distance,
      accuracyMeters: input.captured.accuracyMeters,
    };
  }
  return {
    status:
      distance <= input.allowedRadiusMeters
        ? "AT_BUSINESS_LOCATION"
        : "OUTSIDE_BUSINESS_LOCATION",
    distanceMeters: distance,
    accuracyMeters: input.captured.accuracyMeters,
  };
}

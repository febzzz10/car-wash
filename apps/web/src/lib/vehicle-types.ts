import type { VehicleType } from "@washpro/contracts";

import fourWheelerImage from "../assets/vehicle-types/four-wheeler.png";
import threeWheelerImage from "../assets/vehicle-types/three-wheeler.png";
import twoWheelerImage from "../assets/vehicle-types/two-wheeler.png";

export interface VehicleTypeOption {
  readonly imageSrc: string;
  readonly label: string;
  readonly value: VehicleType;
}

export const VEHICLE_TYPE_OPTIONS: readonly VehicleTypeOption[] = [
  { imageSrc: twoWheelerImage, label: "Two Wheeler", value: "TWO_WHEELER" },
  { imageSrc: threeWheelerImage, label: "Three Wheeler", value: "THREE_WHEELER" },
  { imageSrc: fourWheelerImage, label: "Four Wheeler", value: "FOUR_WHEELER" },
] as const;

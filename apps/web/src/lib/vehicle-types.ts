import type { VehicleType } from "@washpro/contracts";
import { Car } from "lucide-react";
import type { ComponentType } from "react";

import AutoRickshaw from "../components/auto-icon";
import MotorcycleIcon from "../components/motorcycle-icon";

export interface VehicleTypeOption {
  readonly icon: ComponentType<{ size?: number; className?: string }>;
  readonly label: string;
  readonly value: VehicleType;
}

export const VEHICLE_TYPE_OPTIONS: readonly VehicleTypeOption[] = [
  { icon: MotorcycleIcon, label: "Two Wheeler", value: "TWO_WHEELER" },
  { icon: AutoRickshaw, label: "Three Wheeler", value: "THREE_WHEELER" },
  { icon: Car, label: "Four Wheeler", value: "FOUR_WHEELER" },
] as const;

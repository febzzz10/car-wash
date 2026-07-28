import { Check } from "lucide-react";
import { useId } from "react";

import { VEHICLE_TYPE_OPTIONS } from "../lib/vehicle-types";

interface VehicleTypeSelectProps {
  disabled?: boolean;
  error?: string;
  onChange?: (value: string) => void;
  value?: string;
}

export default function VehicleTypeSelect({
  disabled = false,
  error,
  onChange,
  value = "",
}: VehicleTypeSelectProps) {
  const groupId = useId();
  const hasError = error !== undefined && error.length > 0;
  const errorId = `${groupId}-error`;
  const name = `${groupId}-vehicle-type`;

  return (
    <fieldset
      aria-describedby={hasError ? errorId : undefined}
      aria-invalid={hasError || undefined}
      className="vehicle-type-field"
      disabled={disabled}
    >
      <legend className="sr-only">Vehicle type</legend>
      <div className="vehicle-type-cards">
        {VEHICLE_TYPE_OPTIONS.map((option) => {
          const inputId = `${groupId}-${option.value}`;
          const checked = option.value === value;
          return (
            <label
              className={`vehicle-type-card${checked ? " vehicle-type-card--selected" : ""}${hasError ? " vehicle-type-card--error" : ""}`}
              htmlFor={inputId}
              key={option.value}
            >
              <input
                checked={checked}
                className="sr-only"
                disabled={disabled}
                id={inputId}
                name={name}
                onChange={() => onChange?.(option.value)}
                type="radio"
                value={option.value}
              />
              <img
                alt=""
                aria-hidden="true"
                className="vehicle-type-card__image"
                src={option.imageSrc}
              />
              <span className="vehicle-type-card__label">{option.label}</span>
              {checked ? (
                <span aria-hidden className="vehicle-type-card__check">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {hasError ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

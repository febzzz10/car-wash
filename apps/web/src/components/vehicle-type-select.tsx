import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

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
  const listboxId = useId();
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected =
    VEHICLE_TYPE_OPTIONS.find((opt) => opt.value === value) ?? null;
  const hasError = error !== undefined && error.length > 0;

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (index: number) => {
      const option = VEHICLE_TYPE_OPTIONS[index];
      if (option !== undefined) {
        onChange?.(option.value);
        close();
      }
    },
    [onChange, close],
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent | Event) {
      if (
        listRef.current &&
        !listRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
        setFocusedIndex(
          VEHICLE_TYPE_OPTIONS.findIndex((opt) => opt.value === value),
        );
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev < VEHICLE_TYPE_OPTIONS.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : VEHICLE_TYPE_OPTIONS.length - 1,
        );
        break;
      case "Home":
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        event.preventDefault();
        setFocusedIndex(VEHICLE_TYPE_OPTIONS.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (focusedIndex >= 0) select(focusedIndex);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    index: number,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(index);
    }
  }

  const errorId = `${triggerId}-error`;

  return (
    <div className="field">
      <div className={`input-wrapper${hasError ? " input-wrapper--error" : ""}`}>
        <button
          aria-activedescendant={
            open && focusedIndex >= 0
              ? `${listboxId}-option-${focusedIndex}`
              : undefined
          }
          aria-controls={listboxId}
          aria-describedby={hasError ? errorId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={hasError}
          aria-label="Vehicle type"
          role="combobox"
          className="vehicle-type-trigger"
          disabled={disabled}
          id={triggerId}
          onBlur={(e) => {
            if (!listRef.current?.contains(e.relatedTarget as Node)) {
              close();
            }
          }}
          onClick={() => {
            if (!disabled) setOpen((prev) => !prev);
          }}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          type="button"
        >
          {selected === null ? (
            <span className="vehicle-type-placeholder">Select vehicle type</span>
          ) : (
            <>
              <selected.icon aria-hidden size={20} />
              <span>{selected.label}</span>
            </>
          )}
          <ChevronDown
            aria-hidden
            className={`vehicle-type-chevron${open ? " vehicle-type-chevron--open" : ""}`}
            size={16}
          />
        </button>
      </div>
      {open ? (
        <div
          aria-label="Select vehicle type"
          className="vehicle-type-dropdown"
          id={listboxId}
          ref={listRef}
          role="listbox"
        >
          {VEHICLE_TYPE_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const isSelected = option.value === value;
            const isFocused = index === focusedIndex;
            return (
              <div
                aria-selected={isSelected}
                className={`vehicle-type-option${isSelected ? " vehicle-type-option--selected" : ""}${isFocused ? " vehicle-type-option--focused" : ""}`}
                id={`${listboxId}-option-${index}`}
                key={option.value}
                onClick={() => select(index)}
                onKeyDown={(e) => handleOptionKeyDown(e, index)}
                role="option"
                tabIndex={-1}
              >
                <Icon aria-hidden size={20} />
                <span>{option.label}</span>
                {isSelected ? <span className="vehicle-type-check">✓</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {hasError ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

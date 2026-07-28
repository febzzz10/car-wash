import { useCallback, useEffect, useId, useRef, useState } from "react";

import { api, queryString } from "../lib/api";

const DEBOUNCE_MS = 200;
const MAX_SUGGESTIONS = 10;

interface Suggestion {
  readonly name: string;
}

interface VehicleAttributeAutocompleteProps {
  readonly "aria-describedby"?: string;
  readonly className?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly endpoint: string;
  readonly maxLength?: number;
  readonly name: string;
  readonly onBlur?: () => void;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly value?: string;
}

export default function VehicleAttributeAutocomplete({
  "aria-describedby": ariaDescribedby,
  className = "",
  defaultValue,
  disabled = false,
  endpoint,
  maxLength,
  name,
  onBlur,
  onChange,
  placeholder,
  required = false,
  value: controlledValue,
}: VehicleAttributeAutocompleteProps) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const value = isControlled ? controlledValue : internalValue;
  const [suggestions, setSuggestions] = useState<readonly Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupId = useId();
  const listboxId = `${groupId}-listbox`;
  const inputId = `${groupId}-input`;

  const fetchSuggestions = useCallback(
    async (query: string, seq: number) => {
      if (abortRef.current !== null) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const result = await api<readonly Suggestion[]>(
          `${endpoint}${queryString({ q: query, limit: String(MAX_SUGGESTIONS) })}`,
          { signal: controller.signal },
        );
        if (seq !== requestSeq.current) return;
        setSuggestions(result);
        setOpen(result.length > 0);
        setActiveIndex(-1);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (seq !== requestSeq.current) return;
        setSuggestions([]);
        setOpen(false);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    if (value === "") {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value, seq);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current !== null &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newValue = event.target.value;
    if (!isControlled) setInternalValue(newValue);
    onChange?.(newValue);
  }

  function selectSuggestion(suggestion: Suggestion) {
    if (!isControlled) setInternalValue(suggestion.name);
    onChange?.(suggestion.name);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      }
      case "Enter": {
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          event.preventDefault();
          selectSuggestion(suggestions[activeIndex]!);
        }
        break;
      }
      case "Escape": {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
      }
    }
  }

  function handleBlur() {
    onBlur?.();
  }

  function handleSuggestionMouseDown(event: React.MouseEvent, suggestion: Suggestion) {
    event.preventDefault();
    selectSuggestion(suggestion);
  }

  const activeDescendantId =
    activeIndex >= 0 && open
      ? `${groupId}-option-${activeIndex}`
      : undefined;

  return (
    <div className={`autocomplete-wrapper${className !== "" ? ` ${className}` : ""}`} ref={containerRef}>
      <input
        aria-activedescendant={activeDescendantId}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-describedby={ariaDescribedby}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-owns={open ? listboxId : undefined}
        autoComplete="off"
        disabled={disabled}
        id={inputId}
        maxLength={maxLength}
        name={name}
        onBlur={handleBlur}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        required={required}
        role="combobox"
        type="text"
        value={value}
      />
      {loading ? (
        <span aria-hidden className="autocomplete-spinner" />
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          className="autocomplete-listbox"
          id={listboxId}
          ref={listboxRef}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                aria-selected={isActive}
                className={`autocomplete-option${isActive ? " autocomplete-option--active" : ""}`}
                id={`${groupId}-option-${index}`}
                key={suggestion.name}
                onMouseDown={(event) => handleSuggestionMouseDown(event, suggestion)}
                role="option"
              >
                {suggestion.name}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

import { Check } from "lucide-react";
import { useId } from "react";

import { PAYMENT_METHOD_OPTIONS } from "../lib/payment-methods";

interface PaymentMethodSelectProps {
  disabled?: boolean;
  error?: string | undefined;
  name?: string;
  onChange?: (value: string) => void;
  value?: string;
}

export default function PaymentMethodSelect({
  disabled = false,
  error,
  name,
  onChange,
  value = "",
}: PaymentMethodSelectProps) {
  const groupId = useId();
  const hasError = error !== undefined && error.length > 0;
  const errorId = `${groupId}-error`;
  const radioName = name ?? `${groupId}-payment-method`;

  return (
    <fieldset
      aria-describedby={hasError ? errorId : undefined}
      aria-invalid={hasError || undefined}
      className="payment-method-field"
      disabled={disabled}
    >
      <legend className="sr-only">Payment method</legend>
      <div className="payment-method-cards">
        {PAYMENT_METHOD_OPTIONS.map((option) => {
          const inputId = `${groupId}-${option.value}`;
          const checked = option.value === value;
          return (
            <label
              className={`payment-method-card${checked ? " payment-method-card--selected" : ""}${hasError ? " payment-method-card--error" : ""}`}
              htmlFor={inputId}
              key={option.value}
            >
              <input
                checked={checked}
                className="sr-only"
                disabled={disabled}
                id={inputId}
                name={radioName}
                onChange={() => onChange?.(option.value)}
                type="radio"
                value={option.value}
              />
              <img
                alt=""
                aria-hidden="true"
                className="payment-method-card__image"
                src={option.image}
              />
              <span className="payment-method-card__label">
                {option.label}
              </span>
              {checked ? (
                <span aria-hidden className="payment-method-card__check">
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

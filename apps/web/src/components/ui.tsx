import { LoaderCircle, Search, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { titleCase } from "../lib/format";

export function PageHeader({
  actions,
  eyebrow,
  title,
}: {
  readonly actions?: ReactNode;
  readonly eyebrow?: string;
  readonly title: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow === undefined ? null : <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {actions}
    </header>
  );
}

export function Button({
  busy = false,
  children,
  className = "",
  tone = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly busy?: boolean;
  readonly tone?: "primary" | "secondary" | "danger" | "quiet";
}) {
  return (
    <button
      aria-busy={busy}
      className={`button button--${tone} ${className}`}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? <LoaderCircle aria-hidden className="spin" size={18} /> : null}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function StatusBadge({ value }: { readonly value: string }) {
  const tone = value.toLocaleLowerCase().replaceAll("_", "-");
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {titleCase(value)}
    </span>
  );
}

export function SearchField({
  label = "Search",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { readonly label?: string }) {
  return (
    <label className="search-field">
      <span className="sr-only">{label}</span>
      <Search aria-hidden size={19} />
      <input
        autoComplete="off"
        name="search"
        spellCheck={false}
        type="search"
        {...props}
      />
    </label>
  );
}

export function EmptyState({
  action,
  icon: Icon,
  message,
  title,
}: {
  readonly action?: ReactNode;
  readonly icon: LucideIcon;
  readonly message: string;
  readonly title: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon aria-hidden size={25} />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { readonly count?: number }) {
  return (
    <div aria-label="Loading" className="skeleton-list" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <CircleAlertIcon />
      <div>
        <strong>Something needs attention</strong>
        <p>{message}</p>
      </div>
      {onRetry === undefined ? null : (
        <Button onClick={onRetry} tone="secondary">
          Try again
        </Button>
      )}
    </div>
  );
}

function CircleAlertIcon() {
  return (
    <span aria-hidden className="error-state__mark">
      !
    </span>
  );
}

export function Dialog({
  children,
  onClose,
  open,
  title,
}: {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => {
      const first =
        panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    });
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || panelRef.current === null) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ];
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="dialog-layer"
      role="dialog"
    >
      <button
        aria-label="Close dialog"
        className="dialog-scrim"
        onClick={onClose}
        type="button"
      />
      <div className="dialog-panel" ref={panelRef} tabIndex={-1}>
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

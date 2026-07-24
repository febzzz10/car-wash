import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly tone: "success" | "error";
}

interface ToastContextValue {
  readonly error: (message: string) => void;
  readonly success: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([]);
  const dismiss = useCallback(
    (id: string) =>
      setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const show = useCallback(
    (message: string, tone: ToastItem["tone"]) => {
      const id = crypto.randomUUID();
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(
    () => ({
      error: (message: string) => show(message, "error"),
      success: (message: string) => show(message, "success"),
    }),
    [show],
  );

  return (
    <ToastContext value={value}>
      {children}
      <div aria-live="polite" className="toast-stack">
        {items.map((item) => (
          <div
            className={`toast toast--${item.tone}`}
            key={item.id}
            role="status"
          >
            {item.tone === "success" ? (
              <CheckCircle2 aria-hidden size={20} />
            ) : (
              <CircleAlert aria-hidden size={20} />
            )}
            <span>{item.message}</span>
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() => dismiss(item.id)}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (context === null)
    throw new Error("useToast must be used within ToastProvider");
  return context;
}

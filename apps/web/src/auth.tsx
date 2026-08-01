import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError, jsonBody, setCsrfToken } from "./lib/api";
import { configureFormatting, type FormattingPreferences } from "./lib/format";
import type { AuthUser } from "./types";

interface SessionPayload {
  readonly csrfToken: string;
  readonly manualDiscountEnabled?: boolean;
  readonly paymentDefaultMethod?: string;
  readonly preferences: FormattingPreferences;
  readonly user: {
    readonly branchId: string | null;
    readonly fullName?: string;
    readonly id?: string;
    readonly permissions: readonly string[];
    readonly role: "ADMIN" | "STAFF";
    readonly userId?: string;
    readonly userName?: string;
    readonly username?: string;
  };
}

interface AuthContextValue {
  readonly loading: boolean;
  readonly manualDiscountEnabled: boolean;
  readonly paymentDefaultMethod: string;
  readonly user: AuthUser | null;
  readonly login: (identifier: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CANONICAL_PAYMENT_METHODS = new Set([
  "CASH",
  "UPI",
  "BANK_UPI",
  "PAYTM",
]);

function safePaymentDefaultMethod(value: string | undefined): string {
  return value !== undefined && CANONICAL_PAYMENT_METHODS.has(value)
    ? value
    : "CASH";
}

function safeManualDiscountEnabled(value: boolean | undefined): boolean {
  return value === true;
}

function mapSession(payload: SessionPayload): AuthUser {
  return {
    branchId: payload.user.branchId,
    fullName: payload.user.fullName ?? payload.user.userName ?? "WashPro user",
    id: payload.user.id ?? payload.user.userId ?? "",
    permissions: payload.user.permissions,
    role: payload.user.role,
    username: payload.user.username,
  };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [paymentDefaultMethod, setPaymentDefaultMethod] =
    useState<string>("CASH");
  const [manualDiscountEnabled, setManualDiscountEnabled] =
    useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<SessionPayload>("/auth/session");
      setCsrfToken(payload.csrfToken);
      setPaymentDefaultMethod(safePaymentDefaultMethod(payload.paymentDefaultMethod));
      setManualDiscountEnabled(safeManualDiscountEnabled(payload.manualDiscountEnabled));
      configureFormatting(payload.preferences);
      setUser(mapSession(payload));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      setCsrfToken("");
      setPaymentDefaultMethod("CASH");
      setManualDiscountEnabled(false);
      configureFormatting(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      manualDiscountEnabled,
      paymentDefaultMethod,
      user,
      login: async (identifier, password) => {
        const payload = await api<SessionPayload>("/auth/login", {
          ...jsonBody({ identifier, password }),
          method: "POST",
        });
        setCsrfToken(payload.csrfToken);
        setPaymentDefaultMethod(safePaymentDefaultMethod(payload.paymentDefaultMethod));
        setManualDiscountEnabled(safeManualDiscountEnabled(payload.manualDiscountEnabled));
        configureFormatting(payload.preferences);
        setUser(mapSession(payload));
      },
      logout: async () => {
        await api<undefined>("/auth/logout", { method: "POST" });
        setCsrfToken("");
        setPaymentDefaultMethod("CASH");
        setManualDiscountEnabled(false);
        configureFormatting(null);
        setUser(null);
      },
      refresh,
    }),
    [loading, manualDiscountEnabled, paymentDefaultMethod, refresh, user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === null)
    throw new Error("useAuth must be used within AuthProvider");
  return context;
}

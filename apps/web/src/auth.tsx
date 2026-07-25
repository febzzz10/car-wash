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
  readonly user: AuthUser | null;
  readonly login: (identifier: string, password: string) => Promise<void>;
  readonly loginWithAccess: () => void;
  readonly logout: () => Promise<void>;
  readonly refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

const accessTeamDomain =
  typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_ACCESS_TEAM_DOMAIN
    ? import.meta.env.VITE_ACCESS_TEAM_DOMAIN
    : "";

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const payload = await api<SessionPayload>("/auth/session");
      setCsrfToken(payload.csrfToken);
      configureFormatting(payload.preferences);
      setUser(mapSession(payload));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      setCsrfToken("");
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
      user,
      login: async (identifier, password) => {
        const payload = await api<SessionPayload>("/auth/login", {
          ...jsonBody({ identifier, password }),
          method: "POST",
        });
        setCsrfToken(payload.csrfToken);
        configureFormatting(payload.preferences);
        setUser(mapSession(payload));
      },
      loginWithAccess: () => {
        if (accessTeamDomain === "") return;
        const hostname = window.location.hostname;
        window.location.href = `https://${accessTeamDomain}/cdn-cgi/access/login/${hostname}?redirect_uri=${encodeURIComponent(window.location.origin + "/dashboard")}`;
      },
      logout: async () => {
        if (accessTeamDomain !== "") {
          try {
            await api<undefined>("/auth/logout", { method: "POST" });
          } catch {
            // ignore API errors during Access logout
          }
          setCsrfToken("");
          configureFormatting(null);
          setUser(null);
          window.location.href = `https://${accessTeamDomain}/cdn-cgi/access/logout`;
        } else {
          await api<undefined>("/auth/logout", { method: "POST" });
          setCsrfToken("");
          configureFormatting(null);
          setUser(null);
        }
      },
      refresh,
    }),
    [loading, refresh, user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === null)
    throw new Error("useAuth must be used within AuthProvider");
  return context;
}

import type { Permission, UserRole } from "@washpro/contracts";

export interface AuthContext {
  readonly branchId: string | null;
  readonly organizationId: string;
  readonly permissions: readonly Permission[];
  readonly role: UserRole;
  readonly sessionId: string;
  readonly userId: string;
  readonly userName: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: {
    auth: AuthContext;
    rawSessionToken: string;
    requestId: string;
  };
}

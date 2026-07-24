import type { Permission, UserRole, UserStatus } from "@washpro/contracts";

export interface PermissionSubject {
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly permissions: readonly Permission[];
}

export function hasPermission(
  subject: PermissionSubject,
  permission: Permission,
): boolean {
  if (subject.status !== "ACTIVE") return false;
  return subject.role === "ADMIN" || subject.permissions.includes(permission);
}

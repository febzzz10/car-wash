import { maskPhoneNumber } from "@washpro/domain";

export function maskedPhoneForRole(
  role: string,
  value: string | null,
): string | null {
  return role === "STAFF" && value !== null ? maskPhoneNumber(value) : value;
}

export function maskPhoneSnapshotRow<T>(row: T, role: string): T {
  if (role !== "STAFF" || row === null || typeof row !== "object") return row;
  const value = (row as { readonly customer_phone_snapshot?: unknown })
    .customer_phone_snapshot;
  if (typeof value !== "string") return row;
  return {
    ...row,
    customer_phone_snapshot: maskPhoneNumber(value),
  } as T;
}

export function maskCustomerPhoneRow<T>(row: T, role: string): T {
  if (role !== "STAFF" || row === null || typeof row !== "object") return row;
  const value = (row as { readonly customer_phone?: unknown }).customer_phone;
  if (typeof value !== "string") return row;
  return { ...row, customer_phone: maskPhoneNumber(value) } as T;
}
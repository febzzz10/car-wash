import { maskPhoneNumber } from "@washpro/domain";
import { useAuth } from "../auth";

const identity = (phone: string | null | undefined): string => phone ?? "";

export function useMaskedPhone(): (phone: string | null | undefined) => string {
  const { user } = useAuth();
  return user?.role === "STAFF" ? maskPhoneNumber : identity;
}
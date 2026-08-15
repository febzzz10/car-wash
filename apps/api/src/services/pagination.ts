import { ApiError } from "../http/errors";

export const DEFAULT_LIST_LIMIT = 15;
export const MAX_LIST_LIMIT = 50;

export function parseListLimit(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT;
}

export function parseListCursor(cursor: string): {
  readonly orderValue: string;
  readonly id: string;
} {
  if (cursor.length > 512) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
  }
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
  }
  const separator = decoded.lastIndexOf("|");
  if (separator === -1) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
  }
  const orderValue = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (orderValue === "" || id === "") {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
  }
  return { orderValue, id };
}

export function buildListCursor(orderValue: string, id: string): string {
  return btoa(`${orderValue}|${id}`);
}

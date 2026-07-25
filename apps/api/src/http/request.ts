import type { Context } from "hono";

import type { AppBindings } from "../types";
import { ApiError } from "./errors";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function clientIp(c: Context<AppBindings>): string | null {
  return c.req.header("cf-connecting-ip") ?? null;
}

export function isUnsafeMethod(method: string): boolean {
  return unsafeMethods.has(method.toUpperCase());
}

export function assertAllowedOrigin(c: Context<AppBindings>): void {
  const origin = c.req.header("origin");

  // Same-origin requests from browsers may omit the Origin header.
  if (origin === undefined) return;

  const allowed = new Set(
    c.env.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowed.has(origin)) {
    throw new ApiError(
      403,
      "CSRF_REJECTED",
      "The request origin was rejected.",
    );
  }
}

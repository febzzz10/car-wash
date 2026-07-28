import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../http/errors";
import { requirePermission } from "../middleware/auth";
import { clientIp } from "../http/request";
import { reverseGeocode } from "../services/geocode";
import { checkRateLimit, rateLimitKey } from "../services/rate-limit";
import type { AppBindings } from "../types";

const reverseGeocodeSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const geocodeRoutes = new Hono<AppBindings>();

geocodeRoutes.post("/reverse", requirePermission("wash_jobs.create"), async (c) => {
  const auth = c.get("auth");
  const ip = clientIp(c);

  const rlKey = await rateLimitKey(auth.userId, ip);
  const { allowed } = await checkRateLimit(c.env, rlKey, 10, 600, 3);
  if (!allowed) {
    throw new ApiError(429, "GEOCODE_RATE_LIMITED", "Too many location requests. Try again later.");
  }

  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = reverseGeocodeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Provide valid latitude and longitude.");
  }

  const place = await reverseGeocode(c.env, parsed.data.latitude, parsed.data.longitude);
  if (place === null) {
    throw new ApiError(502, "GEOCODING_UNAVAILABLE", "Unable to identify the current place.");
  }

  return c.json({ data: { place }, success: true });
});

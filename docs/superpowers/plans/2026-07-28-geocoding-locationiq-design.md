# Server-Side Reverse Geocoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-side Nominatim geocoding with an authenticated WashPro API endpoint using LocationIQ (primary), globally throttled Nominatim fallback, and HMAC-protected KV caching.

**Architecture:** Browser POSTs rounded coordinates to `/api/v1/geocode/reverse`. Handler checks KV cache, calls LocationIQ, or falls back through a Durable Object–throttled Nominatim call. Returns only `{ place }`.

**Tech Stack:** Hono, Zod, Cloudflare Workers, Durable Objects, KV, LocationIQ, Nominatim

## Global Constraints

- Never log coordinates, provider URLs, secrets, or resolved places
- Use existing `CACHE` KV binding; do not add a second KV namespace
- Use `requireSession` + `requirePermission("wash_jobs.create")` + CSRF
- KV stores only `{ place }`; HMAC-protected cache keys; no readable coords
- TTL clamped 300–172800 (LocationIQ free-plan max)
- Durable Object enforces ≥1000ms between Nominatim calls globally
- Rate limit: 10 req/10min per user, burst 3, KV-based
- LocationIQ base URL allowlisted (`us1`/`eu1` only)
- Frontend sends POST with `{ latitude, longitude }`, receives `{ place }`
- Frontend stores only `place` + `capturedAt`; never coordinates
- Coordinate-only places rejected in drafts and API
- Photo required; location optional
- Legacy GPS accuracy/distance hidden on admin pages
- `dateTime()` used everywhere; no raw `Date` methods
- OSM attribution: `Location data © OpenStreetMap contributors`

---

### Task 1: Environment types, Wrangler config, and vitest

**Files:**
- Modify: `apps/api/src/env.d.ts`
- Modify: `apps/api/wrangler.jsonc`
- Modify: `apps/api/vitest.config.ts`
- Modify: `apps/api/test/env.d.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/durable-objects/nominatim-throttle.ts`

**Interfaces:**
- Consumes: existing `Env`, `AppBindings`, `CACHE` KV, wrangler conventions
- Produces: augmented `Env` with new bindings, DO class exported, wrangler with DO+migrations, vitest with test bindings

- [ ] **Step 1: Create `nominatim-throttle.ts`**

```typescript
// apps/api/src/durable-objects/nominatim-throttle.ts
export class NominatimThrottle {
  private lastCallTime = 0;

  async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < 1000) {
      return new Response(
        JSON.stringify({ error: "THROTTLED", message: "Nominatim rate limit enforced." }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    this.lastCallTime = now;
    const body: Record<string, unknown> = await request.json().catch(() => ({}));
    const url = body.url as string | undefined;
    const userAgent = body.userAgent as string | undefined;
    if (typeof url !== "string" || typeof userAgent !== "string") {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, "Accept-Language": "en" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: "PROVIDER_FAILED" }),
          { status: 502, headers: { "content-type": "application/json" } },
        );
      }
      const text = await response.text();
      return new Response(text, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "PROVIDER_FAILED" }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
  }
}
```

- [ ] **Step 2: Update `apps/api/src/index.ts` to export DO**

```typescript
import { app } from "./app";
import { NominatimThrottle } from "./durable-objects/nominatim-throttle";
import { runScheduledMaintenance } from "./services/maintenance";

export { NominatimThrottle };

export default {
  fetch: app.fetch,
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 3: Add env bindings to `apps/api/src/env.d.ts`**

Add these fields to the `Env` interface:
```typescript
LOCATIONIQ_API_KEY: string;
GEOCODE_CACHE_PEPPER: string;
LOCATIONIQ_BASE_URL: string;
GEOCODE_USER_AGENT: string;
GEOCODE_CACHE_TTL_SECONDS: string;
NOMINATIM_THROTTLE: DurableObjectNamespace<NominatimThrottle>;
```

- [ ] **Step 4: Update `apps/api/wrangler.jsonc`**

Add `durable_objects`, `migrations`, and new `vars`:
```jsonc
"durable_objects": {
  "bindings": [
    { "binding": "NOMINATIM_THROTTLE", "class_name": "NominatimThrottle" }
  ]
},
"migrations": [
  { "tag": "v1", "new_classes": ["NominatimThrottle"] }
],
"vars": {
  // ... existing vars ...
  "LOCATIONIQ_BASE_URL": "https://us1.locationiq.com",
  "GEOCODE_USER_AGENT": "WashPro/1.0",
  "GEOCODE_CACHE_TTL_SECONDS": "172800",
},
"secrets": {
  "required": [
    // ... existing secrets ...
    "LOCATIONIQ_API_KEY",
    "GEOCODE_CACHE_PEPPER",
  ],
},
```

- [ ] **Step 5: Update `apps/api/vitest.config.ts`**

Add DO binding and new env vars to the Miniflare bindings:
```typescript
bindings: {
  // ... existing bindings ...
  LOCATIONIQ_API_KEY: "test-locationiq-key",
  GEOCODE_CACHE_PEPPER: "test-geocode-pepper-not-for-production",
  LOCATIONIQ_BASE_URL: "https://us1.locationiq.com",
  GEOCODE_USER_AGENT: "WashProTest/1.0",
  GEOCODE_CACHE_TTL_SECONDS: "172800",
  NOMINATIM_THROTTLE: { bindingName: "NOMINATIM_THROTTLE", className: "NominatimThrottle" },
}
```

- [ ] **Step 6: Update `apps/api/test/env.d.ts`**

Add test typings:
```typescript
declare namespace Cloudflare {
  interface Env {
    // ... existing ...
    LOCATIONIQ_API_KEY: string;
    GEOCODE_CACHE_PEPPER: string;
    LOCATIONIQ_BASE_URL: string;
    GEOCODE_USER_AGENT: string;
    GEOCODE_CACHE_TTL_SECONDS: string;
    NOMINATIM_THROTTLE: DurableObjectNamespace;
  }
}
```

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass

---

### Task 2: Rate-limiter service

**Files:**
- Create: `apps/api/src/services/rate-limit.ts`

**Interfaces:**
- Consumes: `Env` with `CACHE` KV binding
- Produces: `checkRateLimit(env, key, maxRequests, windowSeconds, burst)` → `{ allowed: boolean; remaining: number }`

- [ ] **Step 1: Write `rate-limit.ts`**

```typescript
import { sha256 } from "../security/tokens";

export async function checkRateLimit(
  env: Env,
  key: string,
  maxRequests: number,
  windowSeconds: number,
  burst: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const hash = await sha256(key);
  const cacheKey = `georate:${hash}`;
  const raw = await env.CACHE.get(cacheKey);
  const current = Number(raw ?? "0");
  if (current >= maxRequests + burst) {
    return { allowed: false, remaining: 0 };
  }
  await env.CACHE.put(cacheKey, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: Math.max(0, maxRequests + burst - current - 1) };
}

export function rateLimitKey(userId: string, ip: string | null): string {
  const suffix = ip ?? "unknown";
  return `geocode:${userId}:${suffix}`;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass

---

### Task 3: Geocode service

**Files:**
- Create: `apps/api/src/services/geocode.ts`

**Interfaces:**
- Consumes: `Env` with `CACHE`, `LOCATIONIQ_API_KEY`, `GEOCODE_CACHE_PEPPER`, `LOCATIONIQ_BASE_URL`, `GEOCODE_USER_AGENT`, `GEOCODE_CACHE_TTL_SECONDS`, `NOMINATIM_THROTTLE`
- Produces: `reverseGeocode(env, latitude, longitude)` → `{ place: string } | null`, `buildCacheKey(env, lat, lng)` → string, `formatPlace(address)` → string | null

- [ ] **Step 1: Write the complete `geocode.ts`**

```typescript
import { sha256 } from "../security/tokens";

const ALLOWED_LOCATIONIQ_HOSTS = new Set([
  "us1.locationiq.com",
  "eu1.locationiq.com",
]);

interface NormalizedAddress {
  locality?: string;
  district?: string;
  state?: string;
}

const LOCALITY_KEYS = [
  "town", "city", "municipality", "village", "suburb",
  "neighbourhood", "city_district", "hamlet",
] as const;

const DISTRICT_KEYS = ["state_district", "district", "county"] as const;

const COORDINATE_ONLY = /^\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,2}(?:\.\d+)?\s*[°d]?\s*[NS]?\s*[,;\s]+\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,3}(?:\.\d+)?\s*[°d]?\s*[EW]?\s*$/i;

function firstValue(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
  }
  return undefined;
}

function normalizeDistrict(district: string): string {
  let d = district.trim();
  d = d.replace(/\s+/g, " ");
  if (/ district$/i.test(d)) {
    const candidate = d.replace(/\s+district$/i, "");
    if (candidate.trim().length > 0 && candidate.toLowerCase() !== d.toLowerCase()) {
      return candidate.trim();
    }
  }
  return d;
}

function deduplicate(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function formatPlace(address: NormalizedAddress): string | null {
  const locality = address.locality?.trim();
  const district = address.district?.trim();
  const state = address.state?.trim();

  if (locality && district) {
    const normalizedDistrict = normalizeDistrict(district);
    if (!deduplicate(locality, normalizedDistrict)) {
      const result = `${locality}, ${normalizedDistrict}`;
      return result.length > 500 ? result.slice(0, 500) : result;
    }
    return locality;
  }
  if (locality) return locality;
  if (district) return normalizeDistrict(district);
  if (state) return state;
  return null;
}

export function validatePlace(place: string): boolean {
  if (place.length > 500) return false;
  if (COORDINATE_ONLY.test(place)) return false;
  return true;
}

function normalizeProviderResponse(data: Record<string, unknown>): NormalizedAddress {
  const address = data.address as Record<string, unknown> | undefined;
  if (!address || typeof address !== "object") return {};
  return {
    locality: firstValue(address, LOCALITY_KEYS as readonly string[]),
    district: firstValue(address, DISTRICT_KEYS as readonly string[]),
    state: typeof address.state === "string" ? address.state.trim() : undefined,
  };
}

export async function buildCacheKey(env: Env, latitude: number, longitude: number): Promise<string> {
  const roundedLat = Number(latitude.toFixed(3));
  const roundedLng = Number(longitude.toFixed(3));
  const normalizedLat = Object.is(roundedLat, -0) ? 0 : roundedLat;
  const normalizedLng = Object.is(roundedLng, -0) ? 0 : roundedLng;
  const input = `${normalizedLat.toFixed(3)}|${normalizedLng.toFixed(3)}`;
  const hash = await sha256(`${input}\u0000${env.GEOCODE_CACHE_PEPPER}`);
  return `geocode:v1:${hash}`;
}

async function checkCache(env: Env, cacheKey: string): Promise<string | null> {
  try {
    const raw = await env.CACHE.get(cacheKey);
    if (raw === null) return null;
    const parsed: Record<string, unknown> = JSON.parse(raw);
    return typeof parsed.place === "string" && parsed.place.length > 0 ? parsed.place : null;
  } catch {
    return null;
  }
}

async function writeCache(env: Env, cacheKey: string, place: string): Promise<void> {
  try {
    const ttl = Math.max(300, Math.min(172800, Number(env.GEOCODE_CACHE_TTL_SECONDS) || 172800));
    await env.CACHE.put(cacheKey, JSON.stringify({ place }), { expirationTtl: ttl });
  } catch {
    // Non-fatal; provider response already obtained
  }
}

async function fetchLocationIQ(
  env: Env,
  lat: number,
  lng: number,
): Promise<string | null> {
  const baseUrl = env.LOCATIONIQ_BASE_URL || "https://us1.locationiq.com";
  let host: string;
  try { host = new URL(baseUrl).hostname; } catch { return null; }
  if (!ALLOWED_LOCATIONIQ_HOSTS.has(host)) return null;

  const url = `${baseUrl}/v1/reverse?key=${encodeURIComponent(env.LOCATIONIQ_API_KEY)}&lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data: Record<string, unknown> = await response.json();
    if (data.error) return null;
    const normalized = normalizeProviderResponse(data);
    const place = formatPlace(normalized);
    if (place === null || !validatePlace(place)) return null;
    return place;
  } catch {
    return null;
  }
}

async function fetchNominatim(
  env: Env,
  lat: number,
  lng: number,
): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const userAgent = env.GEOCODE_USER_AGENT || "WashPro/1.0";
  const doId = env.NOMINATIM_THROTTLE.idFromName("nominatim-global-throttle");
  const stub = env.NOMINATIM_THROTTLE.get(doId);
  const doRequest = new Request("https://do/nominatim", {
    method: "POST",
    body: JSON.stringify({ url, userAgent }),
  });
  try {
    const doResponse = await stub.fetch(doRequest);
    if (!doResponse.ok) return null;
    const data: Record<string, unknown> = await doResponse.json();
    const normalized = normalizeProviderResponse(data);
    const place = formatPlace(normalized);
    if (place === null || !validatePlace(place)) return null;
    return place;
  } catch {
    return null;
  }
}

const inFlightMap = new Map<string, Promise<string | null>>();

export async function reverseGeocode(
  env: Env,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const cacheKey = await buildCacheKey(env, latitude, longitude);

  // Check in-flight map
  const existing = inFlightMap.get(cacheKey);
  if (existing !== undefined) return existing;

  const promise = (async (): Promise<string | null> => {
    // 1. Check KV cache
    const cached = await checkCache(env, cacheKey);
    if (cached !== null) return cached;

    // 2. LocationIQ primary
    const place = await fetchLocationIQ(env, latitude, longitude);
    if (place !== null) {
      await writeCache(env, cacheKey, place);
      return place;
    }

    // 3. Nominatim fallback (globally throttled)
    const fallback = await fetchNominatim(env, latitude, longitude);
    if (fallback !== null) {
      await writeCache(env, cacheKey, fallback);
      return fallback;
    }

    return null;
  })();

  inFlightMap.set(cacheKey, promise);
  promise.finally(() => inFlightMap.delete(cacheKey)).catch(() => {});
  return promise;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass

---

### Task 4: Geocode route

**Files:**
- Create: `apps/api/src/routes/geocode.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write `geocode.ts`**

```typescript
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

  // Rate-limit check
  const rlKey = rateLimitKey(auth.userId, ip);
  const { allowed } = await checkRateLimit(c.env, rlKey, 10, 600, 3);
  if (!allowed) {
    throw new ApiError(429, "GEOCODE_RATE_LIMITED", "Too many location requests. Try again later.");
  }

  // Validate request
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = reverseGeocodeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Provide valid latitude and longitude.");
  }

  // Reverse geocode (no coordinates in logs)
  const place = await reverseGeocode(c.env, parsed.data.latitude, parsed.data.longitude);
  if (place === null) {
    throw new ApiError(502, "GEOCODING_UNAVAILABLE", "Unable to identify the current place.");
  }

  return c.json({ data: { place }, success: true });
});
```

- [ ] **Step 2: Mount route in `apps/api/src/app.ts`**

Add import:
```typescript
import { geocodeRoutes } from "./routes/geocode";
```

Add mount after the `protectedApi` section (near other routes):
```typescript
protectedApi.route("/geocode", geocodeRoutes);
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass

---

### Task 5: API schema strict mode + COORDINATE_ONLY preservation

**Files:**
- Modify: `apps/api/src/routes/wash-jobs.ts`

- [ ] **Step 1: Add `.strict()` to location schema**

Find the `location` object schema and add `.strict()`:

```typescript
location: z.object({
  place: z.string().trim().min(1).max(500)
    .refine(
      (val) => !COORDINATE_ONLY.test(val),
      { message: "Location place must be a human-readable place name, not raw coordinates." },
    )
    .optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
}).strict()  // <-- ADD THIS
.refine(
  // ... existing refinement ...
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @washpro/api typecheck
```
Expected: pass

---

### Task 6: Frontend — replace browser geocoding, update UI

**Files:**
- Modify: `apps/web/src/pages/new-wash.tsx`

- [ ] **Step 1: Remove the `reverseGeocode` function (lines 797-812)**

Delete the `reverseGeocode` function entirely.

- [ ] **Step 2: Update `captureLocation` to POST to API**

Replace the existing `captureLocation` function body:

```typescript
async function captureLocation() {
  if (!("geolocation" in navigator)) {
    setLocError("Geolocation is not available in this browser.");
    return;
  }
  setLocBusy(true);
  setLocError(null);
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const capturedAt = Number.isFinite(position.timestamp)
        ? new Date(position.timestamp).toISOString()
        : new Date().toISOString();
      try {
        const result = await api<{ readonly place: string }>("/geocode/reverse", {
          ...jsonBody({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
          method: "POST",
        });
        onChange({
          ...evidence,
          place: result.place,
          capturedAt,
        });
      } catch {
        setLocError("Unable to identify the current place.");
      } finally {
        setLocBusy(false);
      }
    },
    (failure) => {
      setLocError(
        failure.code === failure.PERMISSION_DENIED
          ? "Location permission was denied."
          : "Unable to get the current location.",
      );
      setLocBusy(false);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
  );
}
```

- [ ] **Step 3: Update the location display after capture**

Replace the location display section inside `PhotoLocationStep`:

```typescript
{locationDone ? (
  <div className="location-captured-info">
    <MapPin size={18} />
    <div>
      <p className="location-place">{evidence.place}</p>
      <p className="location-time">
        Captured at {evidence.capturedAt ? dateTime(evidence.capturedAt) : ""}
      </p>
    </div>
  </div>
) : (
  <p className="step-intro">
    Optionally capture your current location to record a readable place name.
  </p>
)}
```

Add `import { dateTime } from "../lib/format";` at top.

- [ ] **Step 4: Update intro text**

Remove "instead of raw GPS coordinates" from the intro text.

- [ ] **Step 5: Update Wash Summary sidebar**

Replace the evidence-check section:

```typescript
<div className="evidence-check">
  <span className={evidence.photoAssetId === undefined ? "" : "done"}>
    <Camera size={17} /> Live photo {evidence.photoAssetId === undefined ? "needed" : "captured"}
  </span>
</div>
{evidence.place !== undefined ? (
  <SummaryLine
    label="Location"
    value={evidence.place}
  />
) : (
  <SummaryLine
    label="Location"
    value="Not captured"
  />
)}
{evidence.place !== undefined && evidence.capturedAt !== undefined ? (
  <SummaryLine
    label="Captured at"
    value={dateTime(evidence.capturedAt)}
  />
) : null}
```

- [ ] **Step 6: Update ReviewStep to use `dateTime`**

Replace:
```typescript
<strong>{new Date(evidence.capturedAt).toLocaleString()}</strong>
```
with:
```typescript
<strong>{dateTime(evidence.capturedAt)}</strong>
```

- [ ] **Step 7: Install `dateTime` import at top**

```typescript
import { dateTime, money } from "../lib/format";
```

- [ ] **Step 8: Run web typecheck**

```bash
pnpm --filter @washpro/web typecheck
```
Expected: pass

---

### Task 7: Frontend — hide legacy GPS on admin pages

**Files:**
- Modify: `apps/web/src/pages/wash-job-detail.tsx`
- Modify: `apps/web/src/pages/customer-detail.tsx`

- [ ] **Step 1: Update `wash-job-detail.tsx` location card**

Replace the location display block (lines 362-388) with:

```tsx
<div>
  <span className="evidence-icon"><MapPin /></span>
  <strong>Location</strong>
  {record.location_place !== null && record.location_place !== undefined ? (
    <>
      <span>{record.location_place}</span>
      <small>{dateTime(record.location_captured_at)}</small>
    </>
  ) : record.locations.length > 0 ? (
    <>
      <span>Legacy location recorded</span>
      <small>{dateTime(record.locations.at(-1)?.captured_at)}</small>
    </>
  ) : (
    <>
      <span>Not captured</span>
      <small>—</small>
    </>
  )}
</div>
```

- [ ] **Step 2: Update `customer-detail.tsx` location history**

Replace the "GPS captures" HistoryGroup (lines 350-368) with:

```tsx
<HistoryGroup title={`Location captures (${history.data?.locations.length ?? 0})`}>
  {history.data?.locations.slice(0, 5).map((location) => (
    <div key={location.id}>
      <span>
        <strong>Legacy location recorded</strong>
        <small>{dateTime(location.captured_at)}</small>
      </span>
    </div>
  ))}
</HistoryGroup>
```

- [ ] **Step 3: Run web typecheck**

```bash
pnpm --filter @washpro/web typecheck
```
Expected: pass

---

### Task 8: Draft normalization

**Files:**
- Modify: `apps/web/src/lib/wizard-draft.ts`
- Modify: `apps/web/src/lib/wizard-draft.test.ts`

- [ ] **Step 1: Add COORDINATE_ONLY rejection to `parseWizardDraft`**

After the whitespace trimming, add:
```typescript
const COORDINATE_ONLY = /^\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,2}(?:\.\d+)?\s*[°d]?\s*[NS]?\s*[,;\s]+\s*(?:(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*)?-?\d{1,3}(?:\.\d+)?\s*[°d]?\s*[EW]?\s*$/i;

if (typeof raw.place === "string") {
  raw.place = raw.place.trim();
  if (raw.place === "" || COORDINATE_ONLY.test(raw.place)) {
    delete raw.place;
    delete raw.capturedAt;
  }
}
```

- [ ] **Step 2: Add tests**

Add these test cases to the "Evidence draft consistency" describe block:

```typescript
it("rejects coordinate-only place in draft", () => {
  const raw = JSON.stringify({
    version: 2, step: 3, stepId: "photo-location",
    place: "9.123, 76.456",
    capturedAt: "2026-07-28T12:00:00.000Z",
    addOnServiceIds: [], rewardUnits: 0, manualDiscountMinor: 0, startImmediately: false,
  });
  const parsed = parseWizardDraft(raw);
  expect(parsed).not.toBeNull();
  expect(parsed!.place).toBeUndefined();
  expect(parsed!.capturedAt).toBeUndefined();
});

it("rejects lat/lng text in draft place", () => {
  const raw = JSON.stringify({
    version: 2, step: 3, stepId: "photo-location",
    place: "lat: 9.123, lng: 76.456",
    capturedAt: "2026-07-28T12:00:00.000Z",
    addOnServiceIds: [], rewardUnits: 0, manualDiscountMinor: 0, startImmediately: false,
  });
  const parsed = parseWizardDraft(raw);
  expect(parsed).not.toBeNull();
  expect(parsed!.place).toBeUndefined();
});

it("preserves legitimate numbered address in draft", () => {
  const raw = JSON.stringify({
    version: 2, step: 3, stepId: "photo-location",
    place: "12th Main Road, Bengaluru",
    capturedAt: "2026-07-28T12:00:00.000Z",
    addOnServiceIds: [], rewardUnits: 0, manualDiscountMinor: 0, startImmediately: false,
  });
  const parsed = parseWizardDraft(raw);
  expect(parsed).not.toBeNull();
  expect(parsed!.place).toBe("12th Main Road, Bengaluru");
});
```

- [ ] **Step 3: Run web tests**

```bash
pnpm --filter @washpro/web test
```
Expected: pass

---

### Task 9: Production preflight and AGENTS.md

**Files:**
- Modify: `apps/api/scripts/validate-production-deploy.mjs`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update preflight validator**

Add to `REQUIRED_SECRETS`:
```javascript
const REQUIRED_SECRETS = [
  "ADMIN_LOGIN_PASSWORD",
  "BOOTSTRAP_TOKEN",
  "CSRF_SECRET",
  "INVOICE_TOKEN_PEPPER",
  "SESSION_PEPPER",
  "LOCATIONIQ_API_KEY",
  "GEOCODE_CACHE_PEPPER",
];
```

Add DO binding check:
```javascript
const doBinding = bindingByName(config?.durable_objects?.bindings, "NOMINATIM_THROTTLE");
if (!doBinding || doBinding.class_name !== "NominatimThrottle") {
  errors.push("NOMINATIM_THROTTLE Durable Object binding must be configured.");
}
```

Add new env var checks:
```javascript
const baseUrl = config?.vars?.LOCATIONIQ_BASE_URL;
if (typeof baseUrl !== "string" || !["https://us1.locationiq.com", "https://eu1.locationiq.com"].includes(baseUrl)) {
  errors.push("LOCATIONIQ_BASE_URL must be https://us1.locationiq.com or https://eu1.locationiq.com.");
}

if (!config?.vars?.GEOCODE_USER_AGENT || typeof config.vars.GEOCODE_USER_AGENT !== "string" || config.vars.GEOCODE_USER_AGENT.trim() === "") {
  errors.push("GEOCODE_USER_AGENT must be set.");
}

const ttl = Number(config?.vars?.GEOCODE_CACHE_TTL_SECONDS);
if (!Number.isInteger(ttl) || ttl < 300 || ttl > 172800) {
  errors.push("GEOCODE_CACHE_TTL_SECONDS must be an integer between 300 and 172800.");
}
```

- [ ] **Step 2: Run preflight test**

```bash
pnpm run test:deployment
```
Expected: pass

- [ ] **Step 3: Add OSM attribution to AGENTS.md and web app**

Find an appropriate location (e.g., footer or settings page) and add:
```
Location data © OpenStreetMap contributors
```

- [ ] **Step 4: Update AGENTS.md**

Add permanent rules block about geocoding, privacy, caching, DO throttle, and display rules.

---

### Task 10: API tests

**Files:**
- Create: `apps/api/test/geocode.test.ts`

This test file covers:
1. Rate limiting (10/10min, burst 3)
2. Request validation (valid, invalid, NaN, strict rejection)
3. Authentication (401, 403)
4. Place formatting
5. DO throttle behaviour
6. Cache key format (HMAC, no readable coords)

Due to the complexity of mocking providers, KV, and DO in the vitest-pool-workers environment, focus on:
- Route validation and auth tests
- The pure functions (`formatPlace`, `validatePlace`, `buildCacheKey` logic)
- Rate limiting

Integration tests for provider fallback require real bindings and are best verified in browser tests.

---

### Task 11: Web tests

**Files:**
- Modify: `apps/web/src/lib/wizard-draft.test.ts` (already covered in Task 8)

Run full web test suite:
```bash
pnpm --filter @washpro/web test
```

---

### Task 12: Full verification

- [ ] **Step 1: Typecheck all workspaces**
```bash
pnpm -r typecheck
```

- [ ] **Step 2: Run all tests**
```bash
pnpm -r test
```

- [ ] **Step 3: Build web**
```bash
pnpm run build:web
```

- [ ] **Step 4: Run deployment preflight**
```bash
pnpm run test:deployment
```

- [ ] **Step 5: API Wrangler dry-run**
```bash
pnpm --filter @washpro/api exec wrangler deploy --dry-run
```

- [ ] **Step 6: Web Wrangler dry-run (if needed)**
```bash
pnpm --dir apps/web exec wrangler deploy --dry-run --config dist/washpro_web/wrangler.json 2>&1 | head -20
```

- [ ] **Step 7: Search for stale patterns**
```bash
Select-String -Pattern "setTimeout-based gate|Nominatim API key|coords\.latitude|coords\.longitude|accuracyMeters|distance from branch|step === 7|<<<<<<<|=======|>>>>>>>|window\.alert|window\.prompt|window\.confirm" -Path "apps/api/src/**/*.ts","apps/web/src/**/*.{ts,tsx}" 2>&1
```

- [ ] **Step 8: Git status**
```bash
git status --short; git diff --stat
```

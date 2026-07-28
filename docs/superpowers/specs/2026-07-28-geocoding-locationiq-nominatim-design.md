# Design: Server-Side Reverse Geocoding — LocationIQ Primary with Nominatim Fallback

**Date:** 2026-07-28
**Status:** Approved (updated per review requirements 1–20)

## 1. Problem

The New Wash wizard currently calls the OpenStreetMap Nominatim API directly from the
browser using `addressdetails=0`, receiving only the raw `display_name` field (e.g.
*"Kottarakkara, Kottarakkara Taluk, Kollam District, Kerala, 691506, India"*) with no
opportunity to format into a concise locality-and-district place. The full `display_name`
is stored as `location_place` in D1.

Additionally:
- Nominatim usage is currently initiated directly by the browser and is not centrally
  authenticated, rate-limited, cached, or controlled by WashPro.
- There is no caching; repeated location captures for the same area call the provider
  every time.
- There is no provider fallback when the primary provider is unavailable.
- Coordinate fallback logic (`toFixed(6)`) still exists in legacy code.
- Legacy GPS accuracy and distance are still displayed on admin pages.
- The API location schema lacks `.strict()`, allowing stray coordinate fields to pass.

## 2. Solution

Introduce a server-side reverse-geocoding endpoint that relays rounded coordinates
to LocationIQ (primary) or Nominatim (fallback), caches the result in KV, and returns
only a formatted human-readable place.

## 3. Architecture

```
Browser geolocation callback
  → POST /api/v1/geocode/reverse (session auth, wash_jobs.create permission,
    CSRF-protected, exact rate-limited)
    → Round coordinates to 3 decimal places
    → Normalize negative zero, serialize to canonical HMAC input
    → Compute HMAC-SHA-256 cache key (geocode:v1:<hmac>)
    → Check per-isolate in-flight Promise map (coalesce duplicates)
    → KV lookup (CACHE binding, max 48h TTL per LocationIQ free plan)
      → Hit? Return cached { place }
      → Miss? Call LocationIQ (configurable allowlisted base URL,
        accept-language=en, 5s timeout, LOCATIONIQ_API_KEY secret)
        → Success? Normalize address → normalizeDistrict suffix → formatPlace
          → store in KV → return { place }
        → Fail? Call globally throttled Nominatim fallback through Durable Object
          (nominatim-global-throttle, 1s minimum interval between calls,
          accept-language=en, 5s timeout, GEOCODE_USER_AGENT env var)
          → Success? Normalize address → normalizeDistrict suffix → formatPlace
            → store in KV → return { place }
          → Fail? Return 502 GEOCODING_UNAVAILABLE
    → Finally: remove from in-flight map
```

## 4. Files

### New files
- `apps/api/src/services/geocode.ts` — `NormalizedAddress` type, `formatPlace()`,
  `normalizeDistrict()`, `normalizeLocationIQResponse()`, `normalizeNominatimResponse()`,
  `reverseGeocode()` orchestrator, `fetchFromLocationIQ()`, `fetchFromNominatim()`,
  in-flight coalescence map, canonical cache-key builder

- `apps/api/src/routes/geocode.ts` — `POST /api/v1/geocode/reverse` handler with
  request validation, KV-based rate limiting, logging redaction, response formatting

- `apps/api/src/durable-objects/nominatim-throttle.ts` — `NominatimThrottle` Durable
  Object class that serializes fallback requests with minimum 1000ms interval

- `apps/api/src/services/rate-limit.ts` — Reusable KV-based rate limiter (keyed by
  user ID with IP fallback, configurable window and max)

### Modified files
- `apps/api/src/app.ts` — mount `geocodeRoutes`
- `apps/api/src/index.ts` — export `NominatimThrottle` class
- `apps/api/src/env.d.ts` — add `LOCATIONIQ_API_KEY`, `GEOCODE_CACHE_PEPPER`,
  `LOCATIONIQ_BASE_URL`, `GEOCODE_USER_AGENT`, `GEOCODE_CACHE_TTL_SECONDS`,
  `NOMINATIM_THROTTLE` DO binding
- `apps/api/src/routes/wash-jobs.ts` — add `.strict()` to location schema
- `apps/api/vitest.config.ts` — test bindings for geocoding, DO, rate-limit, KV
- `apps/api/test/env.d.ts` — test bindings for geocoding, DO
- `apps/api/wrangler.jsonc` — add `durable_objects`, `migrations`,
  non-secret env vars
- `apps/web/src/pages/new-wash.tsx` — replace browser-side `reverseGeocode` with API
  call; update display to show place + `dateTime()` capturedAt; update error text
  (no "GPS"); preserve `position.timestamp`; duplicate-click prevention
- `apps/web/src/pages/wash-job-detail.tsx` — hide legacy GPS accuracy/distance;
  show `location_place` or "Legacy location recorded" or "Not captured"
- `apps/web/src/pages/customer-detail.tsx` — hide legacy GPS accuracy/distance;
  show "Legacy location recorded"
- `apps/web/src/lib/wizard-draft.ts` — add coordinate-only place rejection in
  `parseWizardDraft`
- `apps/web/src/lib/wizard-draft.test.ts` — add coordinate-rejection tests
- `apps/web/src/lib/format.ts` — no change (already exports `dateTime()`)
- `AGENTS.md` — add permanent geocoding, privacy, caching, DO throttle, and
  display rules

## 5. API Endpoint

### POST /api/v1/geocode/reverse

**Auth:** `requireSession` + `requirePermission("wash_jobs.create")` + CSRF.

**Rate limit:** KV-based, keyed by `auth.userId` (fallback: IP address hash).
  - 10 requests per authenticated user per 600-second (10-minute) sliding window
  - Maximum burst of 3 (checked on increment)
  - Standard HTTP 429 response using project's `ApiError` format
  - No coordinates or place values in rate-limit keys or error messages

**Request schema:**
```typescript
z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict()
```

**Success response:**
```json
{ "data": { "place": "Kottarakkara, Kollam" }, "success": true }
```

**Failure response:**
```json
{ "error": { "code": "GEOCODING_UNAVAILABLE", "message": "Unable to identify the current place.", "requestId": "..." }, "success": false }
```

### Audit and logging redaction

Never logged: request body, coordinates, rounded coordinates, provider URL,
LocationIQ key, HMAC input, KV key, DO request body, raw provider response,
resolved place.

Safe operational events: cache hit/miss, "LocationIQ succeeded", "LocationIQ failed",
"Nominatim fallback succeeded", "Both providers failed", "DO throttle delay occurred",
HTTP status, request duration, rate-limit event.

## 6. Place Formatting

### Locality field priority
1. `town`
2. `city`
3. `municipality`
4. `village`
5. `suburb`
6. `neighbourhood`
7. `city_district`
8. `hamlet`

### District field priority
1. `state_district`
2. `district`
3. `county`

### Normalization step (before formatPlace)
- Trim every component
- Collapse repeated internal whitespace
- Remove trailing "District" suffix from district component when safe
  (e.g. `Kollam District` → `Kollam`)
- Deduplicate components case-insensitively (avoid `Kollam, Kollam`)

### Formatting rules
- Both locality and district → `Locality, District`
- Locality only → locality
- District only → district
- Neither → state (if useful)
- Nothing useful → `null`
- Trim final output
- No postcode, country, country code, road-level detail, `display_name`
- Reject coordinate-only text
- Limit final place to 500 chars (honour Unicode grapheme boundaries)

## 7. Coordinate Privacy

Coordinates are obtained temporarily from the browser and sent through the
authenticated WashPro reverse-geocoding endpoint. Rounded coordinates are
transmitted to LocationIQ or, through a globally throttled Durable Object, to
Nominatim only to resolve a human-readable place. Coordinates are not returned
to the frontend, stored in WashPro application state, draft-persisted, displayed,
written to D1, stored in KV or Durable Object storage, logged by application code,
or included in user-facing errors.

## 8. KV Caching

- Binding: existing `CACHE` KV namespace
- Key prefix: `geocode:v1:`
- Key: `geocode:v1:<HMAC-SHA-256 of canonical coordinate string>`
- HMAC secret: `GEOCODE_CACHE_PEPPER` (Worker secret)
- TTL: `GEOCODE_CACHE_TTL_SECONDS` (env var, default 172800 = 48h,
  min 300, max 172800). Max of 172800 enforced per LocationIQ free-plan terms;
  may only be increased after confirming paid-plan entitlement.
- Cached value: `{ "place": "Kottarakkara, Kollam" }`
- KV failure: silently fall through to providers; silently ignore write failure

### Canonical HMAC input
```typescript
const roundedLat = Number(latitude.toFixed(3));
const roundedLng = Number(longitude.toFixed(3));
const normalizedLat = Object.is(roundedLat, -0) ? 0 : roundedLat;
const normalizedLng = Object.is(roundedLng, -0) ? 0 : roundedLng;
const cacheInput = `${normalizedLat.toFixed(3)}|${normalizedLng.toFixed(3)}`;
// cacheInput used ONLY as HMAC input. Never stored, logged, or returned.
```

### In-flight coalescence
A per-isolate `Map<string, Promise<GeocodeResult>>` keyed by protected cache key
prevents duplicate simultaneous provider calls for the same rounded location.
Settled entries removed in `finally`. KV remains the durable cache; the in-flight
map is a best-effort optimization.

## 9. Provider Configuration

### LocationIQ (primary)
- Base URL from `LOCATIONIQ_BASE_URL` env var
  (allowlisted: `https://us1.locationiq.com`, `https://eu1.locationiq.com`;
  unknown hosts rejected to prevent SSRF)
- Endpoint: `{base_url}/v1/reverse`
- Parameters: `key` (from `LOCATIONIQ_API_KEY` secret), `lat`, `lon`,
  `format=json`, `addressdetails=1`, `accept-language=en`
- Timeout: 5 seconds with AbortController
- Failure conditions: network error, timeout, non-2xx, invalid JSON, missing
  address data, empty formatted place, rate-limit, auth failure

### Nominatim (fallback, globally throttled via Durable Object)
- **All fallback requests pass through the `NominatimThrottle` Durable Object.**
- DO object name: `nominatim-global-throttle` (constant, no coordinates in name)
- DO enforces minimum 1000ms between successive Nominatim calls
- DO serializes requests (isolates cannot call Nominatim in parallel)
- DO never logs coordinates, provider URLs, User-Agent, or raw responses
- DO never persists coordinates in DO storage
- DO never automatically retries
- DO returns only the normalized response or a safe failure
- Endpoint: `https://nominatim.openstreetmap.org/reverse`
- Parameters: `lat`, `lon`, `format=json`, `addressdetails=1`
- User-Agent: `GEOCODE_USER_AGENT` env var
- Headers: `Accept-Language: en`
- Timeout: 5 seconds with AbortController (per-isolate, outside DO)
- KV cache checked before Nominatim is contacted
- LocationIQ success never calls the DO
- LocationIQ failure + KV miss → DO → Nominatim

### OpenStreetMap attribution
Add `Location data © OpenStreetMap contributors` to an appropriate legal/about
or settings area.

## 10. Durable Object: NominatimThrottle

### Identity
- Binding name: `NOMINATIM_THROTTLE`
- File: `apps/api/src/durable-objects/nominatim-throttle.ts`
- Exported from `apps/api/src/index.ts`
- Object name: `nominatim-global-throttle` (constant)

### Behaviour
- Exposes `fetch(request)` handler called by Workers runtime
- Sets `this.lastCallTime` in memory, persists nothing to DO storage
- If `Date.now() - lastCallTime < 1000`, returns 429 without calling Nominatim
- Otherwise: sets `lastCallTime = Date.now()`, makes the Nominatim request,
  returns normalized result or safe failure
- If Nominatim fails (network, timeout, non-2xx, invalid JSON): returns safe failure
- Never logs coordinates, URL, User-Agent, or response body

### Wrangler config
```jsonc
"durable_objects": {
  "bindings": [
    { "binding": "NOMINATIM_THROTTLE", "class_name": "NominatimThrottle" }
  ]
},
"migrations": [
  { "tag": "v1", "new_classes": ["NominatimThrottle"] }
]
```

## 11. Schema Changes

### Database
No database schema change required. Existing `location_place` and
`location_captured_at` columns are reused.

### API validation
Add `.strict()` to the `location` sub-object in `createJobSchema` to reject
unexpected fields like `latitude`, `longitude`, `accuracy`. Coordinate-string
rejection via `COORDINATE_ONLY` regex preserved. Both-or-neither refinement
preserved.

## 12. Rate-Limiter Implementation

File: `apps/api/src/services/rate-limit.ts`

```typescript
async function checkRateLimit(
  env: Env,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; current: number }>
```

The geocode endpoint uses:
- Max: 10 requests
- Window: 600 seconds (10 minutes)
- Key: `geocode:v1:rate:<sha256(userId|ip)>`
- Burst check: reject if current count >= max + burst allowance (3)
- Increments on each request

## 13. Timestamp Handling

- Keep `position.timestamp` in a local variable while reverse geocoding runs
- Save to evidence only after a usable place is returned
- If `position.timestamp` is invalid, capture fallback timestamp immediately
  after successful browser position (not after provider response, not during
  job submission)
- If reverse geocoding fails: discard timestamp, do not set place,
  do not set capturedAt

## 14. Draft Persistence

- Normalize coordinate-only place strings to absent in `parseWizardDraft`
- Preserve legitimate numbered addresses (12th Main Road, Building 24, etc.)
- Both-or-nothing pair normalization already exists

## 15. Logging and Observability

### Never logged
- Request body
- Latitude, longitude, rounded coordinates
- Provider URL containing coordinates
- LocationIQ API key
- HMAC input, KV cache key
- Durable Object request body
- Raw provider response
- Resolved place

### Safe to log
- Route name, HTTP status, duration
- Cache hit/miss
- "LocationIQ succeeded", "LocationIQ failed"
- "Nominatim fallback succeeded", "Both providers failed"
- "DO throttle delay occurred"
- Rate-limit events

## 16. Security

- `LOCATIONIQ_API_KEY` — Worker secret only, never in source
- `GEOCODE_CACHE_PEPPER` — Worker secret only, never in source
- `LOCATIONIQ_BASE_URL` — env var, allowlisted (reject arbitrary URLs → SSRF)
- Coordinate fields rejected by `.strict()` on all relevant Zod schemas
- Rate-limited (10 req/10min per user, burst 3)
- CSRF-protected (POST is unsafe)
- Requires `wash_jobs.create` permission (not a public geocoding proxy)
- Missing production secrets fail deployment preflight safely
- `NOMINATIM_THROTTLE` DO binding required

## 17. Production Preflight

Validate before deploy:
- `LOCATIONIQ_API_KEY` present (fail if missing)
- `GEOCODE_CACHE_PEPPER` present (fail if missing)
- `LOCATIONIQ_BASE_URL` valid and allowlisted (fail if invalid)
- `GEOCODE_CACHE_TTL_SECONDS` within 300–172800 range (fail if out of bounds)
- `GEOCODE_USER_AGENT` present (fail if missing)
- `NOMINATIM_THROTTLE` DO binding present (fail if missing)
- `CACHE` KV binding present (fail if missing)
- Do not print secret values during validation

## 18. Testing

### API request validation
- Valid coordinates accepted
- Missing latitude/longitude rejected
- String coordinates rejected
- Invalid ranges rejected
- NaN/Infinity rejected
- Unexpected fields (accuracy, altitude) rejected

### Authentication and authorization
- 401 without session
- 403 without `wash_jobs.create` permission
- CSRF rejection

### Rate limiting
- Normal capture succeeds
- Manual retry succeeds
- Threshold (10/10min) enforced → 429
- Burst (3) checked
- No coordinates in rate-limit keys or errors

### Durable Object nominatim-throttle
- All Nominatim requests use one globally addressed DO ID
- Object name constant, no coordinates
- Requests serialized
- 1000ms minimum enforced
- Coordinates not stored in DO storage
- Coordinates not logged
- Failed Nominatim not automatically retried
- DO returns safe failure
- LocationIQ success never calls DO
- KV cache hit never calls DO
- In-flight coalescence still prevents duplicates within isolate
- DO binding in API Worker dry run
- Missing DO binding fails production preflight

### LocationIQ primary
- Success calls back with normalized address
- Timeout → Nominatim fallback
- Non-2xx → Nominatim fallback
- Malformed response → Nominatim fallback
- Base URL allowlisting (valid hosts accepted, invalid rejected)

### Nominatim fallback
- Called only when LocationIQ fails
- Durable Object throttle enforces 1s interval
- Returns safe failure when unavailable

### KV caching
- Cache hit avoids provider calls
- Cache key is HMAC (no readable coordinates)
- Cache stores only `{ place }`
- KV read failure → providers
- KV write failure → still returns place
- TTL clamped 300–172800
- Cache prefix correct

### Place formatting
- Locality + district → `Locality, District`
- `Kollam District` → `Kollam`
- Duplicate deduplicated case-insensitively
- Locality-only, district-only, state fallback
- Empty address → null
- Postcode excluded, country excluded, country code excluded
- Raw `display_name` not returned
- Coordinate-only text rejected
- 500-char max enforced
- Unicode-safe truncation
- English language preference sent to both providers

### Coordinate privacy
- Coords not in response, state, draft, D1, KV, DO storage, logs, errors

### Logging redaction
- Request body not logged
- Resolved place not logged
- Missing production secrets fail preflight safely

### Frontend
- Capture location makes one POST
- Request body: only latitude + longitude
- Success stores only place + capturedAt
- Permission denied shows correct error
- Position unavailable shows correct error
- API failure shows "Unable to identify the current place."
- Retry button after failure
- No auto-retry
- Duplicate clicks prevented
- Photo-only evidence allows Continue
- Missing photo blocks Continue
- Wash Summary shows place + time only
- Review shows place + time only
- Admin detail shows place + time only
- Legacy location view hides accuracy + distance
- Timestamp preserved from browser position

### Wash-job persistence
- Captured location sends place + capturedAt
- No captured location sends neither
- D1 stores only place + capturedAt
- No-location D1 fields are NULL
- No fake timestamp generated
- INSERT counts remain correct
- Coordinate string inside place rejected

## 19. Attribution

Add `Location data © OpenStreetMap contributors` text to an appropriate
legal/about or settings page area (not inside the New Wash workflow).

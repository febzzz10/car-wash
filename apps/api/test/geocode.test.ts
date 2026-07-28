import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { createCsrfToken, hashSessionToken } from "../src/security/tokens";
import { buildCacheKey } from "../src/services/geocode";

const timestamp = "2026-07-28T10:00:00.000Z";
const rawToken = "geocode-test-session-token";

beforeEach(async () => {
  const tokenHash = await hashSessionToken(rawToken, env.SESSION_PEPPER);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO organizations (id, display_name, created_at, updated_at) VALUES ('org-gc', 'WashPro GC', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT OR IGNORE INTO branches (id, organization_id, code, name, created_at, updated_at) VALUES ('branch-gc', 'org-gc', 'MAIN', 'Main', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status,
        permissions_json, created_at, updated_at
      ) VALUES ('admin-gc', 'org-gc', 'branch-gc', 'Admin GC', 'admin-gc',
        'admin-gc', 'not-used', 'ADMIN', 'ACTIVE',
        NULL, ?, ?)`,
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-gc', 'org-gc', 'admin-gc', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(tokenHash, timestamp, timestamp),
  ]);
});

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    cookie: `__Host-washpro_session=${rawToken}`,
    origin: "https://washpro.test",
    "x-csrf-token": await createCsrfToken(rawToken, env.CSRF_SECRET),
  };
}

describe("geocode reverse endpoint", () => {
  it("rejects GET requests", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      { headers, method: "GET" },
      env,
    );
    expect(response.status).toBe(404);
  });

  it("rejects authenticated user without wash_jobs.create permission", async () => {
    const noPermToken = "geocode-no-perm-token";
    const noPermHash = await hashSessionToken(noPermToken, env.SESSION_PEPPER);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (
        id, organization_id, default_branch_id, full_name, username,
        username_normalized, password_hash, role, status,
        permissions_json, created_at, updated_at
      ) VALUES ('staff-gc-noperm', 'org-gc', 'branch-gc', 'Staff No Perm', 'staff-noperm',
        'staff-noperm', 'not-used', 'STAFF', 'ACTIVE',
        '["CUSTOMERS_VIEW"]', ?, ?)`,
    ).bind(timestamp, timestamp).run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_sessions (
        id, organization_id, user_id, token_hash, status, created_at,
        last_seen_at, expires_at
      ) VALUES ('session-gc-noperm', 'org-gc', 'staff-gc-noperm', ?, 'ACTIVE', ?, ?, '2099-01-01T00:00:00.000Z')`,
    ).bind(noPermHash, timestamp, timestamp).run();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${noPermToken}`,
      origin: "https://washpro.test",
      "x-csrf-token": await createCsrfToken(noPermToken, env.CSRF_SECRET),
    };
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("rejects missing CSRF token for POST", async () => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${rawToken}`,
      origin: "https://washpro.test",
    };
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("rejects invalid CSRF token for POST", async () => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${rawToken}`,
      origin: "https://washpro.test",
      "x-csrf-token": "invalid-token",
    };
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it("does not expose coordinates in error responses", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: "abc", longitude: "def" }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).not.toContain("abc");
    expect(text).not.toContain("def");
  });
  it("rejects unauthenticated requests", async () => {
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers: { "content-type": "application/json", origin: "https://washpro.test" },
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(401);
  });

  it("rejects missing body", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      { headers, method: "POST" },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("rejects invalid latitude", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 200, longitude: 0 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid longitude", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 0, longitude: -200 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("rejects non-numeric values", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: "abc", longitude: "def" }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("rejects missing longitude field", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("rejects extra fields beyond latitude and longitude", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278, extra: "field" }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it("returns cached result from KV", async () => {
    const cacheKey = await buildCacheKey(env, 51.5074, -0.1278);
    await env.CACHE.put(cacheKey, JSON.stringify({ place: "London, Greater London" }), {
      expirationTtl: 3600,
    });

    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { place: string } }>();
    expect(body.data.place).toBe("London, Greater London");
  });

  it("handles -0 normalization in cache key", async () => {
    const cacheKey = await buildCacheKey(env, 0, 0);
    await env.CACHE.put(cacheKey, JSON.stringify({ place: "Equator, Atlantic Ocean" }), {
      expirationTtl: 3600,
    });

    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: -0, longitude: 0 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { place: string } }>();
    expect(body.data.place).toBe("Equator, Atlantic Ocean");
  });

  it("returns a place string on success", async () => {
    const headers = await authHeaders();
    const response = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { place: string } }>();
    expect(typeof body.data.place).toBe("string");
    expect(body.data.place.length).toBeGreaterThan(0);
  });

  it("rate limits after maxRequests + burst requests", async () => {
    const headers = await authHeaders();
    for (let i = 0; i < 3; i++) {
      const resp = await app.request(
        "/api/v1/geocode/reverse",
        {
          body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
          headers,
          method: "POST",
        },
        env,
      );
      expect(resp.status).toBe(200);
    }
    const rateLimited = await app.request(
      "/api/v1/geocode/reverse",
      {
        body: JSON.stringify({ latitude: 51.5074, longitude: -0.1278 }),
        headers,
        method: "POST",
      },
      env,
    );
    expect(rateLimited.status).toBe(429);
  });
});

describe("formatPlace", () => {
  it("formats locality and district without duplication", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({ locality: "London", district: "Greater London" })).toBe("London, Greater London");
    expect(formatPlace({ locality: "Mumbai", district: "Mumbai district" })).toBe("Mumbai");
    expect(formatPlace({ locality: "Austin", district: "Travis" })).toBe("Austin, Travis");
    expect(formatPlace({ locality: "", district: "Travis" })).toBe("Travis");
    expect(formatPlace({ locality: "Austin", district: "" })).toBe("Austin");
    expect(formatPlace({ locality: "Austin", state: "Texas" })).toBe("Austin");
    expect(formatPlace({})).toBeNull();
  });

  it("truncates at 500 characters", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    const long = "A".repeat(600);
    expect(formatPlace({ locality: long, district: "B" })?.length).toBeLessThanOrEqual(500);
  });
});

describe("validatePlace", () => {
  it("rejects coordinate-only strings", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("51.5074° N, 0.1278° W")).toBe(false);
    expect(validatePlace("lat: 40.7128, lon: -74.0060")).toBe(false);
    expect(validatePlace("12.3456 78.9012")).toBe(false);
    expect(validatePlace("London, UK")).toBe(true);
  });

  it("rejects overlong strings", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("A".repeat(501))).toBe(false);
    expect(validatePlace("A".repeat(500))).toBe(true);
  });
});

describe("provider fallback logic (pure functions)", () => {
  it("normalizeProviderResponse extracts locality from address object", async () => {
    const { normalizeProviderResponse } = await import("../src/services/geocode");
    const result = normalizeProviderResponse({
      address: { city: "London", state: "England" },
    });
    expect(result.locality).toBe("London");
  });

  it("normalizeProviderResponse extracts district from address object", async () => {
    const { normalizeProviderResponse } = await import("../src/services/geocode");
    const result = normalizeProviderResponse({
      address: { county: "Greater London" },
    });
    expect(result.district).toBe("Greater London");
  });

  it("normalizeProviderResponse handles missing address", async () => {
    const { normalizeProviderResponse } = await import("../src/services/geocode");
    expect(normalizeProviderResponse({})).toEqual({});
    expect(normalizeProviderResponse({ address: null })).toEqual({});
  });

  it("normalizeProviderResponse extracts all three fields", async () => {
    const { normalizeProviderResponse } = await import("../src/services/geocode");
    const result = normalizeProviderResponse({
      address: { town: "Kottarakkara", state_district: "Kollam", state: "Kerala" },
    });
    expect(result.locality).toBe("Kottarakkara");
    expect(result.district).toBe("Kollam");
    expect(result.state).toBe("Kerala");
  });

  it("normalizeProviderResponse does not extract display_name", async () => {
    const { normalizeProviderResponse } = await import("../src/services/geocode");
    const result = normalizeProviderResponse({
      display_name: "Kottarakkara, Kollam, Kerala, India",
      address: { town: "Kottarakkara", state_district: "Kollam" },
    });
    expect(result).not.toHaveProperty("display_name");
  });
});

describe("formatPlace specific patterns", () => {
  it("formats town + state_district", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({ locality: "Kottarakkara", district: "Kollam" })).toBe("Kottarakkara, Kollam");
  });

  it("deduplicates city + district when they match", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({ locality: "Kollam", district: "Kollam" })).toBe("Kollam");
  });

  it("strips 'District' suffix and deduplicates", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({ locality: "Kollam", district: "Kollam District" })).toBe("Kollam");
  });

  it("falls back to state-only", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({ state: "Kerala" })).toBe("Kerala");
  });

  it("returns null for empty address", async () => {
    const { formatPlace } = await import("../src/services/geocode");
    expect(formatPlace({})).toBeNull();
  });
});

describe("COORDINATE_ONLY specific patterns", () => {
  it("rejects plain coordinate pair", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("9.1234 76.5678")).toBe(false);
  });

  it("rejects lat/long text", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("lat: 9.1234, long: 76.5678")).toBe(false);
  });

  it("rejects latitude/longitude text", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("latitude: 9.1234, longitude: 76.5678")).toBe(false);
  });

  it("rejects simple degree-formatted coordinates", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("51.5074° N, 0.1278° W")).toBe(false);
    expect(validatePlace("40.7128°N, 74.0060°W")).toBe(false);
  });

  it("accepts legitimate numbered address", async () => {
    const { validatePlace } = await import("../src/services/geocode");
    expect(validatePlace("12th Main Road, Bengaluru")).toBe(true);
    expect(validatePlace("123 Main St, Springfield")).toBe(true);
    expect(validatePlace("Highway 101, San Francisco")).toBe(true);
  });
});

describe("buildCacheKey", () => {
  it("rounds coordinates to 3 decimal places", async () => {
    const key1 = await buildCacheKey(env, 51.50739, -0.12781);
    const key2 = await buildCacheKey(env, 51.50741, -0.12779);
    expect(key1).toBe(key2);
  });
});

describe("rate limit key privacy", () => {
  it("does not contain raw userId in the KV key", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key = await rateLimitKey("admin-test-123", "192.168.1.1");
    expect(key).not.toContain("admin-test-123");
  });

  it("does not contain raw IP address in the KV key", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key = await rateLimitKey("admin-test-123", "192.168.1.1");
    expect(key).not.toContain("192.168.1.1");
  });

  it("does not contain coordinates in the KV key", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key = await rateLimitKey("admin-test-123", "192.168.1.1");
    expect(key).not.toContain("51.5");
    expect(key).not.toContain("-0.12");
  });

  it("produces the same key for the same identity", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key1 = await rateLimitKey("user-1", "10.0.0.1");
    const key2 = await rateLimitKey("user-1", "10.0.0.1");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different identities", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key1 = await rateLimitKey("user-1", "10.0.0.1");
    const key2 = await rateLimitKey("user-2", "10.0.0.1");
    expect(key1).not.toBe(key2);
  });

  it("rate limit key starts with geocode:v1:rate: prefix", async () => {
    const { rateLimitKey } = await import("../src/services/rate-limit");
    const key = await rateLimitKey("any-user", "any-ip");
    expect(key).toMatch(/^geocode:v1:rate:/);
  });
});

describe("NominatimThrottle Durable Object", () => {
  it("rejects bad request body", async () => {
    const doNs = env.NOMINATIM_THROTTLE as DurableObjectNamespace;
    const doId = doNs.idFromName("nominatim-global-throttle");
    const stub = doNs.get(doId);

    const response = await stub.fetch(
      new Request("https://do/nominatim", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 502 for failed provider (timeout)", async () => {
    const doNs = env.NOMINATIM_THROTTLE as DurableObjectNamespace;
    const doId = doNs.idFromName("nominatim-global-throttle");
    const stub = doNs.get(doId);

    const response = await stub.fetch(
      new Request("https://do/nominatim", {
        method: "POST",
        body: JSON.stringify({
          url: "https://nominatim.invalid.example/reverse?lat=51.507&lon=-0.127&format=json&addressdetails=1",
          userAgent: "WashProTest/1.0",
        }),
      }),
    );
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("PROVIDER_FAILED");
  });

  it("DO persists only the throttle timestamp", async () => {
    const { NominatimThrottle } = await import("../src/durable-objects/nominatim-throttle");
    const source = NominatimThrottle.toString();
    expect(source).not.toContain(".storage.put(\"lat");
    expect(source).not.toContain(".storage.put(\"lon");
    expect(source).not.toContain(".storage.put(\"url");
    expect(source).not.toContain(".storage.put(\"userAgent");
    expect(source).not.toContain(".storage.put(\"lastNominatimCallAt");
    expect(source).toContain(".storage.put(\"nextAllowedAt");
  });
});

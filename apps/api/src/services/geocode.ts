import { sha256 } from "../security/tokens";

const ALLOWED_LOCATIONIQ_HOSTS = new Set([
  "us1.locationiq.com",
  "eu1.locationiq.com",
]);

interface NormalizedAddress {
  locality?: string | undefined;
  district?: string | undefined;
  state?: string | undefined;
}

const LOCALITY_KEYS = [
  "town", "city", "municipality", "village", "suburb",
  "neighbourhood", "city_district", "hamlet",
] as const;

const DISTRICT_KEYS = ["state_district", "district", "county"] as const;

const COORDINATE_ONLY = /^\s*(?:(?:lat(?:itude)?|lng|lon(?:g(?:itude)?)?)\s*[:=]\s*)?-?\d{1,2}(?:\.\d+)?\s*[°d]?\s*[NS]?\s*[,;\s]+\s*(?:(?:lat(?:itude)?|lng|lon(?:g(?:itude)?)?)\s*[:=]\s*)?-?\d{1,3}(?:\.\d+)?\s*[°d]?\s*[EW]?\s*$/i;

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
    if (candidate.trim().length > 0) {
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

export function normalizeProviderResponse(data: Record<string, unknown>): NormalizedAddress {
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

  const existing = inFlightMap.get(cacheKey);
  if (existing !== undefined) return existing;

  const promise = (async (): Promise<string | null> => {
    const cached = await checkCache(env, cacheKey);
    if (cached !== null) return cached;

    const place = await fetchLocationIQ(env, latitude, longitude);
    if (place !== null) {
      await writeCache(env, cacheKey, place);
      return place;
    }

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

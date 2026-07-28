import { sha256 } from "../security/tokens";

export async function checkRateLimit(
  env: Env,
  cacheKey: string,
  maxRequests: number,
  windowSeconds: number,
  burst: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const raw = await env.CACHE.get(cacheKey);
  const current = Number(raw ?? "0");
  if (current >= maxRequests + burst) {
    return { allowed: false, remaining: 0 };
  }
  await env.CACHE.put(cacheKey, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: Math.max(0, maxRequests + burst - current - 1) };
}

export async function rateLimitKey(userId: string, ip: string | null): Promise<string> {
  const suffix = ip ?? "unknown";
  const raw = `${userId}\u0000${suffix}`;
  const hash = await sha256(raw);
  return `geocode:v1:rate:${hash}`;
}

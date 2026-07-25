import { createRemoteJWKSet, jwtVerify } from "jose";

import { ApiError } from "../http/errors";

interface AccessClaims {
  readonly email: string;
  readonly sub: string;
}

interface AccessConfig {
  readonly aud: string;
  readonly teamDomain: string;
}

function jwksUrl(teamDomain: string): URL {
  return new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
}

export function accessConfig(env: Env): AccessConfig {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (teamDomain === undefined || teamDomain === "" || aud === undefined || aud === "") {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Access authentication is not configured.",
    );
  }
  return { aud, teamDomain };
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
): Promise<AccessClaims> {
  try {
    if (cachedJwks === null) {
      cachedJwks = createRemoteJWKSet(jwksUrl(config.teamDomain));
    }
    const { payload } = await jwtVerify(token, cachedJwks, {
      audience: config.aud,
      issuer: `https://${config.teamDomain}`,
    });
    if (typeof payload.email !== "string" || payload.email === "") {
      throw new Error("missing email claim");
    }
    return { email: payload.email, sub: payload.sub ?? "" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      401,
      "AUTH_SESSION_EXPIRED",
      "Access identity could not be verified.",
    );
  }
}

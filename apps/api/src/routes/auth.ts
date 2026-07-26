import { loginRequestSchema } from "@washpro/contracts";
import { normalizeEmail, normalizePhone } from "@washpro/domain";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import { ApiError } from "../http/errors";
import { assertAllowedOrigin, clientIp } from "../http/request";
import { sessionCookieName } from "../middleware/auth";
import { randomToken } from "../security/encoding";
import {
  hashPassword,
  passwordPolicyError,
  verifyPassword,
} from "../security/passwords";
import { createCsrfToken, hashSessionToken, sha256 } from "../security/tokens";
import {
  integerSetting,
  loadSettings,
  stringSetting,
  type SettingMap,
} from "../services/settings";
import type { AppBindings } from "../types";

interface UserRow {
  readonly default_branch_id: string | null;
  readonly failed_login_count: number;
  readonly full_name: string;
  readonly id: string;
  readonly locked_until: string | null;
  readonly organization_id: string;
  readonly password_hash: string;
  readonly permissions_json: string | null;
  readonly role: "ADMIN" | "STAFF";
  readonly status: "ACTIVE" | "DISABLED" | "LOCKED";
  readonly username: string;
}

const dummyHash =
  "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function formattingPreferences(settings: SettingMap) {
  return {
    currency: stringSetting(settings, "business.currency", "INR"),
    dateFormat: stringSetting(settings, "business.date_format", "DD/MM/YYYY"),
    locale: stringSetting(settings, "business.number_format", "en-IN"),
    timeZone: stringSetting(settings, "business.timezone", "Asia/Kolkata"),
  };
}

function normalizeIdentifier(value: string): {
  readonly email: string;
  readonly phone: string | null;
  readonly username: string;
} {
  let phone: string | null = null;
  try {
    phone = normalizePhone(value);
  } catch {
    // Non-phone identifiers are expected here.
  }
  return {
    email: normalizeEmail(value),
    phone,
    username: value.trim().toLocaleLowerCase("en-IN"),
  };
}

const encoder = new TextEncoder();

async function constantTimeDigestEqual(
  a: string,
  b: string,
): Promise<boolean> {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const aHash = await globalThis.crypto.subtle.digest("SHA-256", aBytes);
  const bHash = await globalThis.crypto.subtle.digest("SHA-256", bBytes);
  return globalThis.crypto.subtle.timingSafeEqual(aHash, bHash);
}

function isStaticAdminMode(env: Env): boolean {
  return env.APP_ENV === "production" && env.AUTH_MODE === "static_admin";
}

async function recordAttempt(
  env: Env,
  input: {
    readonly failureReason: string | null;
    readonly identifier: string;
    readonly ipAddress: string | null;
    readonly success: boolean;
    readonly user: UserRow | null;
    readonly userAgent: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO login_attempts (
      id, organization_id, attempted_identifier, matched_user_id, success,
      failure_reason, ip_address, user_agent, attempted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.user?.organization_id ?? null,
      input.identifier.slice(0, 254),
      input.user?.id ?? null,
      input.success ? 1 : 0,
      input.failureReason,
      input.ipAddress,
      input.userAgent,
      new Date().toISOString(),
    )
    .run();
}

async function assertLoginRateLimit(
  env: Env,
  identifier: string,
  ipAddress: string | null,
): Promise<string> {
  const key = `login:${await sha256(`${identifier}:${ipAddress ?? "unknown"}`)}`;
  const count = Number((await env.CACHE.get(key)) ?? "0");
  if (count >= 8) {
    throw new ApiError(
      429,
      "AUTH_RATE_LIMITED",
      "Too many sign-in attempts. Try again later.",
    );
  }
  return key;
}

async function incrementLoginRateLimit(env: Env, key: string): Promise<void> {
  const count = Number((await env.CACHE.get(key)) ?? "0");
  await env.CACHE.put(key, String(count + 1), { expirationTtl: 900 });
}

async function createWashProSession(
  c: ReturnType<Parameters<typeof setCookie>[0]>,
  user: UserRow,
  parsedIdentifier: string,
  ipAddress: string | null,
) {
  const rawToken = randomToken();
  const tokenHash = await hashSessionToken(rawToken, c.env.SESSION_PEPPER);
  const csrfToken = await createCsrfToken(rawToken, c.env.CSRF_SECRET);
  const issuedAt = new Date();
  const settings = await loadSettings(
    c.env,
    user.organization_id,
    user.default_branch_id,
  );
  const configuredMinutes = integerSetting(
    settings,
    "security.session_timeout_minutes",
    Math.floor((Number(c.env.SESSION_TTL_SECONDS) || 28_800) / 60),
  );
  const ttlSeconds = Math.max(
    900,
    Math.min(configuredMinutes * 60, 7 * 86_400),
  );
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
  const sessionId = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO user_sessions (
        id, organization_id, user_id, token_hash, status, ip_address,
        user_agent, created_at, last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    ).bind(
      sessionId,
      user.organization_id,
      user.id,
      tokenHash,
      ipAddress,
      c.req.header("user-agent") ?? null,
      issuedAt.toISOString(),
      issuedAt.toISOString(),
      expiresAt.toISOString(),
    ),
    c.env.DB.prepare(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
    ).bind(issuedAt.toISOString(), issuedAt.toISOString(), user.id),
    c.env.DB.prepare(
      `INSERT INTO login_attempts (
        id, organization_id, attempted_identifier, matched_user_id, success,
        ip_address, user_agent, attempted_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      user.organization_id,
      parsedIdentifier,
      user.id,
      ipAddress,
      c.req.header("user-agent") ?? null,
      issuedAt.toISOString(),
    ),
  ]);

  setCookie(c, sessionCookieName, rawToken, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "Strict",
    secure: true,
  });

  return {
    csrfToken,
    expiresAt: expiresAt.toISOString(),
    preferences: formattingPreferences(settings),
    user: {
      branchId: user.default_branch_id,
      fullName: user.full_name,
      id: user.id,
      permissions: JSON.parse(user.permissions_json ?? "[]") as unknown,
      role: user.role,
      username: user.username,
    },
  };
}

// ── Public auth routes ──

export const publicAuthRoutes = new Hono<AppBindings>();

publicAuthRoutes.post("/login", async (c) => {
  assertAllowedOrigin(c);

  const body = await c.req.json().catch(() => null);
  if (typeof body?.password !== "string" || body.password.length > 256) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Enter a valid username and password.",
    );
  }

  if (isStaticAdminMode(c.env)) {
    return await handleStaticAdminLogin(c, body);
  }

  return await handlePbkdf2Login(c, body);
});

// ── Static admin login ──

async function handleStaticAdminLogin(
  c: ReturnType<Parameters<typeof setCookie>[0]>,
  body: Record<string, unknown>,
) {
  const suppliedEmail =
    typeof body.identifier === "string"
      ? normalizeEmail(body.identifier)
      : "";
  const suppliedPassword =
    typeof body.password === "string" ? body.password : "";

  const expectedEmail = normalizeEmail(c.env.ADMIN_LOGIN_EMAIL);
  const expectedPassword = c.env.ADMIN_LOGIN_PASSWORD;
  const identifier = suppliedEmail || "static-admin";

  const ipAddress = clientIp(c);
  const rateLimitKey = await assertLoginRateLimit(
    c.env,
    identifier,
    ipAddress,
  );

  if (expectedPassword.length === 0) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Authentication is not configured.",
    );
  }

  const emailMatch = suppliedEmail === expectedEmail;
  const passwordMatch = await constantTimeDigestEqual(
    suppliedPassword,
    expectedPassword,
  );

  if (!emailMatch || !passwordMatch) {
    await incrementLoginRateLimit(c.env, rateLimitKey);
    await recordAttempt(c.env, {
      failureReason: "INVALID_CREDENTIALS",
      identifier,
      ipAddress,
      success: false,
      user: null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    throw new ApiError(
      401,
      "AUTH_INVALID_CREDENTIALS",
      "The username or password is incorrect.",
    );
  }

  const user = await c.env.DB.prepare(
    `SELECT id, organization_id, default_branch_id, full_name, username,
      password_hash, role, status, permissions_json, failed_login_count, locked_until
    FROM users
    WHERE email_normalized = ?
    LIMIT 1`,
  )
    .bind(expectedEmail)
    .first<UserRow>();

  if (user === null) {
    throw new ApiError(
      500,
      "INTERNAL_ERROR",
      "Admin account not found.",
    );
  }

  if (user.status === "DISABLED") {
    await recordAttempt(c.env, {
      failureReason: "ACCOUNT_DISABLED",
      identifier,
      ipAddress,
      success: false,
      user,
      userAgent: c.req.header("user-agent") ?? null,
    });
    throw new ApiError(
      403,
      "AUTH_ACCOUNT_DISABLED",
      "This account is disabled.",
    );
  }
  if (user.status === "LOCKED" || (user.locked_until !== null && Date.parse(user.locked_until) > Date.now())) {
    throw new ApiError(
      423,
      "AUTH_ACCOUNT_LOCKED",
      "This account is temporarily locked.",
    );
  }
  if (user.role !== "ADMIN") {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "This account is not authorized.",
    );
  }

  const session = await createWashProSession(c, user, identifier, ipAddress);
  return c.json({ data: session, success: true });
}

// ── PBKDF2 password login (local development) ──

async function handlePbkdf2Login(
  c: ReturnType<Parameters<typeof setCookie>[0]>,
  body: Record<string, unknown>,
) {
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Enter a valid username and password.",
    );
  }

  const identifier = normalizeIdentifier(parsed.data.identifier);
  const ipAddress = clientIp(c);
  const rateLimitKey = await assertLoginRateLimit(
    c.env,
    identifier.username,
    ipAddress,
  );
  const user = await c.env.DB.prepare(
    `SELECT id, organization_id, default_branch_id, full_name, username,
      password_hash, role, status, permissions_json, failed_login_count, locked_until
    FROM users
    WHERE username_normalized = ?
       OR email_normalized = ?
       OR (? IS NOT NULL AND phone_normalized = ?)
    LIMIT 1`,
  )
    .bind(
      identifier.username,
      identifier.email,
      identifier.phone,
      identifier.phone,
    )
    .first<UserRow>();

  const validPassword = await verifyPassword(
    parsed.data.password,
    c.env.SESSION_PEPPER,
    user?.password_hash ?? dummyHash,
  );

  if (user === null || !validPassword) {
    await incrementLoginRateLimit(c.env, rateLimitKey);
    await recordAttempt(c.env, {
      failureReason: "INVALID_CREDENTIALS",
      identifier: parsed.data.identifier,
      ipAddress,
      success: false,
      user,
      userAgent: c.req.header("user-agent") ?? null,
    });
    if (user !== null) {
      await c.env.DB.prepare(
        "UPDATE users SET failed_login_count = failed_login_count + 1, updated_at = ?, version = version + 1 WHERE id = ?",
      )
        .bind(new Date().toISOString(), user.id)
        .run();
    }
    throw new ApiError(
      401,
      "AUTH_INVALID_CREDENTIALS",
      "The username or password is incorrect.",
    );
  }

  if (user.status === "DISABLED") {
    await recordAttempt(c.env, {
      failureReason: "ACCOUNT_DISABLED",
      identifier: parsed.data.identifier,
      ipAddress,
      success: false,
      user,
      userAgent: c.req.header("user-agent") ?? null,
    });
    throw new ApiError(
      403,
      "AUTH_ACCOUNT_DISABLED",
      "This account is disabled.",
    );
  }
  if (
    user.status === "LOCKED" ||
    (user.locked_until !== null && Date.parse(user.locked_until) > Date.now())
  ) {
    throw new ApiError(
      423,
      "AUTH_ACCOUNT_LOCKED",
      "This account is temporarily locked.",
    );
  }

  const session = await createWashProSession(c, user, parsed.data.identifier, ipAddress);
  return c.json({ data: session, success: true });
}

// ── Protected auth routes ──

export const protectedAuthRoutes = new Hono<AppBindings>();

protectedAuthRoutes.get("/session", async (c) => {
  const auth = c.get("auth");
  const csrfToken = await createCsrfToken(
    c.get("rawSessionToken"),
    c.env.CSRF_SECRET,
  );
  const settings = await loadSettings(
    c.env,
    auth.organizationId,
    auth.branchId,
  );
  return c.json({
    data: {
      csrfToken,
      preferences: formattingPreferences(settings),
      user: {
        branchId: auth.branchId,
        fullName: auth.userName,
        id: auth.userId,
        permissions: auth.permissions,
        role: auth.role,
        username: auth.userName,
      },
    },
    success: true,
  });
});

protectedAuthRoutes.post("/logout", async (c) => {
  const auth = c.get("auth");
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE user_sessions SET status = 'REVOKED', revoked_at = ?, revoked_reason = 'USER_LOGOUT' WHERE id = ? AND status = 'ACTIVE'",
    ).bind(now, auth.sessionId),
    c.env.DB.prepare(
      `INSERT INTO audit_logs (
        id, organization_id, branch_id, user_id, action, record_type,
        record_id, severity, request_id, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, 'SESSION_REVOKED', 'USER_SESSION', ?, 'INFO', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      auth.organizationId,
      auth.branchId,
      auth.userId,
      auth.sessionId,
      c.get("requestId"),
      clientIp(c),
      c.req.header("user-agent") ?? null,
      now,
    ),
  ]);
  deleteCookie(c, sessionCookieName, { path: "/", secure: true });
  return c.body(null, 204);
});

protectedAuthRoutes.post("/change-password", async (c) => {
  if (isStaticAdminMode(c.env)) {
    throw new ApiError(
      403,
      "AUTH_PERMISSION_DENIED",
      "Password management is not available with static admin authentication.",
    );
  }

  const body: { currentPassword?: string; newPassword?: string } = await c.req
    .json<{ currentPassword?: string; newPassword?: string }>()
    .catch(() => ({}));
  if (
    typeof body.currentPassword !== "string" ||
    typeof body.newPassword !== "string"
  ) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Enter the current and new passwords.",
    );
  }
  const policyError = passwordPolicyError(body.newPassword);
  if (policyError !== null) {
    throw new ApiError(422, "VALIDATION_ERROR", policyError);
  }
  if (body.currentPassword === body.newPassword) {
    throw new ApiError(422, "VALIDATION_ERROR", "Choose a different password.");
  }
  const auth = c.get("auth");
  const currentHash = await c.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ? AND organization_id = ?",
  )
    .bind(auth.userId, auth.organizationId)
    .first<string>("password_hash");
  if (
    currentHash === null ||
    !(await verifyPassword(
      body.currentPassword,
      c.env.SESSION_PEPPER,
      currentHash,
    ))
  ) {
    throw new ApiError(
      401,
      "AUTH_INVALID_CREDENTIALS",
      "The current password is incorrect.",
    );
  }
  const nextHash = await hashPassword(body.newPassword, c.env.SESSION_PEPPER);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND organization_id = ?",
    ).bind(nextHash, now, now, auth.userId, auth.organizationId),
    c.env.DB.prepare(
      "UPDATE user_sessions SET status = 'REVOKED', revoked_at = ?, revoked_reason = 'PASSWORD_CHANGED' WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'",
    ).bind(now, auth.userId, auth.organizationId),
    c.env.DB.prepare(
      `INSERT INTO audit_logs (
        id, organization_id, branch_id, user_id, action, record_type,
        record_id, severity, request_id, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, 'PASSWORD_CHANGED', 'USER', ?, 'CRITICAL', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      auth.organizationId,
      auth.branchId,
      auth.userId,
      auth.userId,
      c.get("requestId"),
      clientIp(c),
      c.req.header("user-agent") ?? null,
      now,
    ),
  ]);
  deleteCookie(c, sessionCookieName, { path: "/", secure: true });
  return c.body(null, 204);
});

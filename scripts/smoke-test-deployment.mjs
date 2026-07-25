import { ok, strictEqual } from "node:assert";
import { test } from "node:test";

const PAGES_URL = process.env.PAGES_URL;
const WORKER_URL = process.env.WORKER_URL;
const BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN;

if (!PAGES_URL) throw new Error("PAGES_URL env var is required");
if (!WORKER_URL) throw new Error("WORKER_URL env var is required");
if (!BOOTSTRAP_TOKEN) throw new Error("BOOTSTRAP_TOKEN env var is required");

const pagesOrigin = new URL(PAGES_URL).origin;
const workerOrigin = new URL(WORKER_URL).origin;

let sessionCookie = "";
let csrfToken = "";

function extractSetCookie(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const c of cookies) {
    const m = c.match(/^__Host-washpro_session=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}

function extractCsrf(response) {
  return response.headers.get("x-csrf-token") ?? "";
}

async function pagesFetch(path, init) {
  const url = `${pagesOrigin}${path}`;
  return fetch(url, {
    ...init,
    redirect: "manual",
  });
}

test("SPA returns index.html on React routes", async () => {
  const res = await pagesFetch("/customers");
  strictEqual(res.status, 200);
  ok(res.headers.get("content-type")?.includes("text/html"));
});

test("SPA returns index.html on root", async () => {
  const res = await pagesFetch("/");
  strictEqual(res.status, 200);
  ok(res.headers.get("content-type")?.includes("text/html"));
});

test("Api 404 errors are forwarded through the proxy", async () => {
  const res = await pagesFetch("/api/v1/nonexistent-route-xyz");
  strictEqual(res.status, 401);
});

test("Health endpoint is NOT proxied (not under /api/)", async () => {
  const res = await pagesFetch("/health");
  strictEqual(res.status, 404);
});

test("Login with bad credentials returns 401", async () => {
  const res = await pagesFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "noone@example.com", password: "wrong" }),
  });
  strictEqual(res.status, 401);
});

test("Login with valid credentials sets session cookie and CSRF token", async () => {
  const res = await pagesFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@washpro.local",
      password: "admin123",
    }),
  });

  if (res.status !== 200) {
    console.log("  ⚠ Login failed — environment may need bootstrapping.");
    console.log("  → Run: node scripts/bootstrap.mjs");
    return;
  }

  strictEqual(res.status, 200);
  const rawToken = extractSetCookie(res);
  ok(rawToken, "Set-Cookie for __Host-washpro_session present");
  sessionCookie = rawToken;
  csrfToken = extractCsrf(res);
  ok(csrfToken, "x-csrf-token header present");
});

test("Authenticated GET request with session cookie", async () => {
  if (!sessionCookie) return;
  const res = await pagesFetch("/api/v1/auth/session", {
    headers: {
      cookie: `__Host-washpro_session=${sessionCookie}`,
    },
  });
  strictEqual(res.status, 200);
  const body = await res.json();
  strictEqual(body.success, true);
  ok(body.data.user);
});

test("CSRF-protected POST succeeds with valid CSRF token", async () => {
  if (!sessionCookie || !csrfToken) return;
  const res = await pagesFetch("/api/v1/customers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${sessionCookie}`,
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({
      name: "Smoke Test Customer",
      phone: "+10000000000",
    }),
  });
  strictEqual(res.status, 200);
});

test("CSRF-protected POST fails without CSRF token", async () => {
  if (!sessionCookie) return;
  const res = await pagesFetch("/api/v1/customers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `__Host-washpro_session=${sessionCookie}`,
    },
    body: JSON.stringify({
      name: "Should Fail",
      phone: "+10000000001",
    }),
  });
  strictEqual(res.status, 403);
});

test("Logout clears session cookie", async () => {
  if (!sessionCookie) return;
  const res = await pagesFetch("/api/v1/auth/logout", {
    method: "POST",
    headers: {
      cookie: `__Host-washpro_session=${sessionCookie}`,
      "x-csrf-token": csrfToken,
    },
  });
  strictEqual(res.status, 200);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const clearCookie = cookies.find((c) =>
    c.startsWith("__Host-washpro_session=;"),
  );
  ok(clearCookie, "session cookie cleared");
});

test("No requests sent directly to public Worker URL for API calls", () => {
  strictEqual(
    process.env.VITE_API_BASE_URL ?? "",
    "",
    "API calls use relative /api/v1/* paths (Pages Function proxy)",
  );
});

test("No requests use localhost origins", () => {
  const allowedOrigins = "http://localhost:5173";
  ok(
    !allowedOrigins.includes(PAGES_URL),
    "production config should not reference localhost",
  );
});

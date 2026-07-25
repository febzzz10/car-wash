import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  D1_COUNT_QUERY_CHUNK_SIZE,
  assertLocalDatabaseHealthy,
  assertSafeTarget,
  buildDataOnlySql,
  chunkItems,
  classifyKvKey,
  classifyD1TargetState,
  deriveImportOrder,
  fingerprintRows,
  getWranglerInvocation,
  isRetryableWranglerFailure,
  parseMigrationArguments,
  parseJsonc,
  selectMigrationTables,
} from "../tools/cloudflare-migration/lib.mjs";
import bridge from "../apps/api/scripts/r2-migration-bridge.mjs";

test("migration rejects every target except the confirmed remote-dev account", () => {
  assert.throws(
    () =>
      assertSafeTarget({
        accountId: "1004e58345fe8befcf206defc4e0e8d0",
        targetEnv: "remote-dev",
      }),
    /account/i,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        accountId: "36c28c2516a8d4f17c0d010d6f12bf5f",
        targetEnv: "production",
      }),
    /remote-dev/i,
  );
});

test("migration selects business data but excludes sessions and migration state", () => {
  assert.deepEqual(
    selectMigrationTables([
      "_cf_METADATA",
      "d1_migrations",
      "schema_migrations",
      "organizations",
      "users",
      "user_sessions",
      "login_attempts",
      "password_reset_tokens",
      "idempotency_keys",
      "customers",
      "wash_jobs",
    ]),
    ["organizations", "users", "customers", "wash_jobs"],
  );
});

test("foreign-key import order places parent tables before children", () => {
  assert.deepEqual(
    deriveImportOrder(
      ["vehicles", "organizations", "customers", "branches"],
      [
        { table: "branches", toTable: "organizations" },
        { table: "customers", toTable: "organizations" },
        { table: "vehicles", toTable: "customers" },
      ],
    ),
    ["organizations", "branches", "customers", "vehicles"],
  );
});

test("foreign-key cycles use domain parent order instead of alphabetical order", () => {
  assert.deepEqual(
    deriveImportOrder(
      [
        "audit_logs",
        "users",
        "file_assets",
        "branches",
        "organizations",
        "business_settings",
      ],
      [
        { table: "branches", toTable: "organizations" },
        { table: "users", toTable: "branches" },
        { table: "users", toTable: "file_assets" },
        { table: "file_assets", toTable: "users" },
        { table: "business_settings", toTable: "users" },
        { table: "audit_logs", toTable: "users" },
      ],
    ),
    [
      "organizations",
      "branches",
      "users",
      "file_assets",
      "business_settings",
      "audit_logs",
    ],
  );
});

test("data-only SQL preserves values and contains no destructive statements", () => {
  const sql = buildDataOnlySql([
    {
      columns: ["id", "name", "amount_minor", "notes"],
      rows: [{ amount_minor: 1234, id: "a'1", name: "Wash", notes: null }],
      table: "customers",
    },
  ]);

  assert.match(
    sql,
    /INSERT INTO "customers" \("id", "name", "amount_minor", "notes"\) VALUES \('a''1', 'Wash', 1234, NULL\);/,
  );
  assert.doesNotMatch(sql, /\b(?:DELETE|DROP|REPLACE|UPDATE)\b/i);
});

test("KV policy skips every known transient WashPro prefix", () => {
  for (const key of [
    "login:abc",
    "capture:abc",
    "session:abc",
    "csrf:abc",
    "rate-limit:abc",
    "invoice-link:abc",
  ]) {
    assert.deepEqual(classifyKvKey(key), {
      action: "skip",
      reason: "transient-or-unapproved",
    });
  }
  assert.deepEqual(classifyKvKey("business:setting"), {
    action: "skip",
    reason: "no-permanent-prefix-allowlisted",
  });
});

test("migration CLI defaults to dry-run and rejects another environment", () => {
  assert.deepEqual(parseMigrationArguments(["migrate"]), {
    command: "migrate",
    execute: false,
    targetEnv: "remote-dev",
  });
  assert.deepEqual(parseMigrationArguments(["migrate", "--execute"]), {
    command: "migrate",
    execute: true,
    targetEnv: "remote-dev",
  });
  assert.throws(
    () =>
      parseMigrationArguments([
        "migrate",
        "--execute",
        "--target-env",
        "production",
      ]),
    /remote-dev/i,
  );
});

test("R2 bridge lists bindings and never exposes an unconfigured bucket", async () => {
  const uploads = {
    list: async () => ({
      cursor: undefined,
      delimitedPrefixes: [],
      objects: [],
      truncated: false,
    }),
  };
  const env = {
    INVOICES: uploads,
    MIGRATION_BRIDGE_TOKEN: "test-token",
    UPLOADS: uploads,
  };
  const authorized = { Authorization: "Bearer test-token" };

  const response = await bridge.fetch(
    new Request("http://localhost/objects?binding=UPLOADS", {
      headers: authorized,
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cursor: null,
    objects: [],
    truncated: false,
  });

  const rejected = await bridge.fetch(
    new Request("http://localhost/objects?binding=UNKNOWN", {
      headers: authorized,
    }),
    env,
  );
  assert.equal(rejected.status, 400);
});

test("R2 bridge uses a create-only condition and reports a concurrent object", async () => {
  let putOptions;
  const env = {
    INVOICES: {},
    MIGRATION_BRIDGE_TOKEN: "test-token",
    UPLOADS: {
      put: async (_key, _body, options) => {
        putOptions = options;
        return null;
      },
    },
  };
  const response = await bridge.fetch(
    new Request(
      "http://localhost/object?binding=UPLOADS&key=evidence/test.jpg",
      {
        body: new Uint8Array([1, 2, 3]),
        headers: {
          Authorization: "Bearer test-token",
          "x-washpro-object-metadata": encodeURIComponent(
            JSON.stringify({
              customMetadata: { assetId: "asset-1" },
              httpMetadata: { contentType: "image/jpeg" },
            }),
          ),
        },
        method: "PUT",
      },
    ),
    env,
  );
  assert.equal(response.status, 409);
  assert.deepEqual(putOptions.onlyIf, { etagDoesNotMatch: "*" });
  assert.deepEqual(putOptions.customMetadata, { assetId: "asset-1" });
  assert.deepEqual(putOptions.httpMetadata, { contentType: "image/jpeg" });
});

test("Wrangler child processes use Node instead of spawning a Windows cmd shim", () => {
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const invocation = getWranglerInvocation(repositoryRoot);
  assert.equal(invocation.executable, process.execPath);
  assert.equal(invocation.argumentsPrefix.length, 1);
  assert.match(
    invocation.argumentsPrefix[0],
    /wrangler[\\/]bin[\\/]wrangler\.js$/,
  );
});

test("D1 verification queries are split below the compound-select limit", () => {
  const chunks = chunkItems(
    Array.from({ length: 33 }, (_, index) => `table_${index}`),
    D1_COUNT_QUERY_CHUNK_SIZE,
  );
  assert.deepEqual(
    chunks.map((chunk) => chunk.length),
    [5, 5, 5, 5, 5, 5, 3],
  );
});

test("D1 fingerprints are stable across row order and change with data", () => {
  const columns = ["id", "amount_minor", "created_at"];
  const rows = [
    { amount_minor: 500, created_at: "2026-01-01T00:00:00Z", id: "b" },
    { amount_minor: 100, created_at: "2025-01-01T00:00:00Z", id: "a" },
  ];
  const original = fingerprintRows(columns, rows);
  assert.equal(fingerprintRows(columns, rows.toReversed()), original);
  assert.notEqual(
    fingerprintRows(columns, [rows[0], { ...rows[1], amount_minor: 101 }]),
    original,
  );
});

test("only transient Wrangler failures are eligible for read-only retries", () => {
  assert.equal(
    isRetryableWranglerFailure({
      status: 1,
      stderr: "",
      stdout: '{"error":{"text":"fetch failed"}}',
    }),
    true,
  );
  assert.equal(
    isRetryableWranglerFailure({
      status: 1,
      stderr: "Authentication error [code: 10000]",
      stdout: "",
    }),
    false,
  );
  assert.equal(
    isRetryableWranglerFailure({ status: 0, stderr: "", stdout: "" }),
    false,
  );
});

test("local migration refuses a corrupt database or broken foreign keys", () => {
  assert.doesNotThrow(() =>
    assertLocalDatabaseHealthy({
      foreignKeyViolations: [],
      integrity: [{ integrity_check: "ok" }],
    }),
  );
  assert.throws(
    () =>
      assertLocalDatabaseHealthy({
        foreignKeyViolations: [],
        integrity: [{ integrity_check: "database disk image is malformed" }],
      }),
    /integrity/i,
  );
  assert.throws(
    () =>
      assertLocalDatabaseHealthy({
        foreignKeyViolations: [{ table: "vehicles" }],
        integrity: [{ integrity_check: "ok" }],
      }),
    /foreign key/i,
  );
});

test("resume requires exact D1 fingerprints, not only equal row counts", () => {
  assert.deepEqual(
    classifyD1TargetState({
      localCounts: { customers: 1 },
      localFingerprints: { customers: "local" },
      remoteCounts: { customers: 0 },
      remoteFingerprints: { customers: "empty" },
      tables: ["customers"],
    }),
    { conflicts: [], status: "empty" },
  );
  assert.deepEqual(
    classifyD1TargetState({
      localCounts: { customers: 1 },
      localFingerprints: { customers: "same" },
      remoteCounts: { customers: 1 },
      remoteFingerprints: { customers: "same" },
      tables: ["customers"],
    }),
    { conflicts: [], status: "exact-match" },
  );
  assert.deepEqual(
    classifyD1TargetState({
      localCounts: { customers: 1 },
      localFingerprints: { customers: "local" },
      remoteCounts: { customers: 1 },
      remoteFingerprints: { customers: "different" },
      tables: ["customers"],
    }),
    {
      conflicts: [
        {
          localCount: 1,
          localFingerprint: "local",
          remoteCount: 1,
          remoteFingerprint: "different",
          table: "customers",
        },
      ],
      status: "conflict",
    },
  );
});

test("JSONC parsing preserves URLs while accepting comments and trailing commas", () => {
  assert.deepEqual(
    parseJsonc(`{
      // Wrangler development origin
      "origin": "http://localhost:5173",
      "bindings": ["DB", "CACHE",],
      /* Named environment */
      "env": { "name": "remote-dev", },
    }`),
    {
      bindings: ["DB", "CACHE"],
      env: { name: "remote-dev" },
      origin: "http://localhost:5173",
    },
  );
});

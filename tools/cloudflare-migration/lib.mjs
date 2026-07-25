import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const CONFIRMED_ACCOUNT_ID = "36c28c2516a8d4f17c0d010d6f12bf5f";
export const D1_COUNT_QUERY_CHUNK_SIZE = 5;
export const TARGET_ENVIRONMENT = "remote-dev";

const EXCLUDED_TABLES = new Set([
  "_cf_METADATA",
  "d1_migrations",
  "idempotency_keys",
  "login_attempts",
  "password_reset_tokens",
  "schema_migrations",
  "user_sessions",
]);

const TRANSIENT_KV_PREFIXES = [
  "capture:",
  "csrf:",
  "invoice-link:",
  "login:",
  "rate-limit:",
  "session:",
];

const IMPORT_PRIORITY = [
  "organizations",
  "branches",
  "users",
  "file_assets",
  "business_settings",
  "expense_categories",
  "vehicle_types",
  "services",
  "service_prices",
  "customers",
  "vehicles",
  "coupons",
  "coupon_eligible_services",
  "coupon_eligible_vehicle_types",
  "referral_codes",
  "wash_jobs",
  "wash_job_items",
  "vehicle_photos",
  "location_captures",
  "timer_events",
  "timer_adjustments",
  "coupon_redemptions",
  "referral_redemptions",
  "referral_rewards",
  "referral_reward_transactions",
  "payments",
  "refunds",
  "invoices",
  "invoice_items",
  "number_sequences",
  "expenses",
  "expense_attachments",
  "audit_logs",
];

function compareImportPriority(left, right) {
  const leftIndex = IMPORT_PRIORITY.indexOf(left);
  const rightIndex = IMPORT_PRIORITY.indexOf(right);
  const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
  const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
  return leftRank - rightRank || left.localeCompare(right);
}

function quoteIdentifier(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("SQL identifiers must be non-empty strings.");
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "bigint" || typeof value === "number") {
    if (!Number.isFinite(Number(value))) {
      throw new TypeError("Non-finite numbers cannot be written to D1.");
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function assertSafeTarget({ accountId, targetEnv }) {
  if (accountId !== CONFIRMED_ACCOUNT_ID) {
    throw new Error(
      `Migration account mismatch: expected ${CONFIRMED_ACCOUNT_ID}.`,
    );
  }
  if (targetEnv !== TARGET_ENVIRONMENT) {
    throw new Error('Migration target must be the "remote-dev" environment.');
  }
}

export function assertLocalDatabaseHealthy({
  foreignKeyViolations,
  integrity,
}) {
  const integrityMessages = integrity.map(
    (row) => row.integrity_check ?? Object.values(row)[0],
  );
  if (
    integrityMessages.length !== 1 ||
    String(integrityMessages[0]).toLowerCase() !== "ok"
  ) {
    throw new Error(
      `Local D1 integrity check failed: ${integrityMessages.join(", ") || "no result"}.`,
    );
  }
  if (foreignKeyViolations.length > 0) {
    throw new Error(
      `Local D1 has ${foreignKeyViolations.length} foreign key violation(s).`,
    );
  }
}

export function classifyD1TargetState({
  localCounts,
  localFingerprints,
  remoteCounts,
  remoteFingerprints,
  tables,
}) {
  const remoteEmpty = tables.every((table) => remoteCounts[table] === 0);
  const localHasRows = tables.some((table) => localCounts[table] > 0);
  if (remoteEmpty && localHasRows) return { conflicts: [], status: "empty" };

  const conflicts = tables
    .filter(
      (table) =>
        localCounts[table] !== remoteCounts[table] ||
        localFingerprints[table] !== remoteFingerprints[table],
    )
    .map((table) => ({
      localCount: localCounts[table],
      localFingerprint: localFingerprints[table],
      remoteCount: remoteCounts[table],
      remoteFingerprint: remoteFingerprints[table],
      table,
    }));
  return {
    conflicts,
    status: conflicts.length === 0 ? "exact-match" : "conflict",
  };
}

export function selectMigrationTables(tables) {
  return tables.filter(
    (table) => !table.startsWith("sqlite_") && !EXCLUDED_TABLES.has(table),
  );
}

export function deriveImportOrder(tables, foreignKeys) {
  const selected = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set()]));
  for (const { table, toTable } of foreignKeys) {
    if (table !== toTable && selected.has(table) && selected.has(toTable)) {
      dependencies.get(table).add(toTable);
    }
  }

  const ordered = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) =>
        [...dependencies.get(table)].every(
          (dependency) => !remaining.has(dependency),
        ),
      )
      .sort(compareImportPriority);
    if (ready.length === 0) {
      const cycleBreaker = [...remaining].sort(compareImportPriority)[0];
      remaining.delete(cycleBreaker);
      ordered.push(cycleBreaker);
      continue;
    }
    for (const table of ready) {
      remaining.delete(table);
      ordered.push(table);
    }
  }
  return ordered;
}

export function buildDataOnlySql(tableData) {
  const statements = [
    "-- WashPro data-only migration. Generated from local D1.",
    "PRAGMA defer_foreign_keys = ON;",
  ];
  for (const { columns, rows, table } of tableData) {
    const columnSql = columns.map(quoteIdentifier).join(", ");
    for (const row of rows) {
      const valueSql = columns
        .map((column) => sqlLiteral(row[column]))
        .join(", ");
      statements.push(
        `INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${valueSql});`,
      );
    }
  }
  return `${statements.join("\n")}\n`;
}

export function classifyKvKey(key) {
  if (TRANSIENT_KV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return { action: "skip", reason: "transient-or-unapproved" };
  }
  return { action: "skip", reason: "no-permanent-prefix-allowlisted" };
}

export function parseMigrationArguments(args) {
  const command = args[0];
  if (!command) throw new Error("A migration command is required.");
  let execute = false;
  let targetEnv = TARGET_ENVIRONMENT;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      execute = true;
    } else if (argument === "--dry-run") {
      execute = false;
    } else if (argument === "--target-env") {
      targetEnv = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown migration argument: ${argument}`);
    }
  }
  assertSafeTarget({
    accountId: CONFIRMED_ACCOUNT_ID,
    targetEnv,
  });
  return { command, execute, targetEnv };
}

export function getWranglerInvocation(repositoryRoot) {
  return {
    argumentsPrefix: [
      resolve(repositoryRoot, "node_modules/wrangler/bin/wrangler.js"),
    ],
    executable: process.execPath,
  };
}

export function chunkItems(items, size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new TypeError("Chunk size must be a positive integer.");
  }
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function fingerprintRows(columns, rows) {
  const normalize = (value) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Uint8Array) {
      return { bytesHex: Buffer.from(value).toString("hex") };
    }
    return value;
  };
  const serializedRows = rows
    .map((row) =>
      JSON.stringify(columns.map((column) => normalize(row[column]))),
    )
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({ columns, rows: serializedRows }))
    .digest("hex");
}

export function isRetryableWranglerFailure(result) {
  if (result.status === 0) return false;
  const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|\b(?:429|500|502|503|504)\b/i.test(
    detail,
  );
}

export function parseJsonc(text) {
  let withoutComments = "";
  let inBlockComment = false;
  let inLineComment = false;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
        withoutComments += character;
      }
      continue;
    }
    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      } else if (character === "\n") {
        withoutComments += character;
      }
      continue;
    }
    if (!inString && character === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (!inString && character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    withoutComments += character;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    }
  }

  let withoutTrailingCommas = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (!inString && character === ",") {
      let lookahead = index + 1;
      while (/\s/.test(withoutComments[lookahead] ?? "")) lookahead += 1;
      if (["}", "]"].includes(withoutComments[lookahead])) continue;
    }
    withoutTrailingCommas += character;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    }
  }
  return JSON.parse(withoutTrailingCommas);
}

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  CONFIRMED_ACCOUNT_ID,
  D1_COUNT_QUERY_CHUNK_SIZE,
  TARGET_ENVIRONMENT,
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
} from "./lib.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const API_ROOT = resolve(ROOT, "apps/api");
const CONFIG_PATH = resolve(API_ROOT, "wrangler.jsonc");
const BACKUP_ROOT = resolve(ROOT, "migration-backups");
const LOCAL_STATE = resolve(API_ROOT, ".wrangler/state");
const WRANGLER = getWranglerInvocation(ROOT);
const R2_BRIDGE_CLIENT = resolve(
  ROOT,
  "tools/cloudflare-migration/r2-bridge-client.mjs",
);

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? Number(value) : value;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

function appendMigrationLog(directory, message) {
  appendFileSync(
    resolve(directory, "migration.log"),
    `[${new Date().toISOString()}] ${message}\n`,
    "utf8",
  );
}

function parseJsonOutput(output) {
  const arrayStart = output.indexOf("[");
  const objectStart = output.indexOf("{");
  const start =
    arrayStart === -1
      ? objectStart
      : objectStart === -1
        ? arrayStart
        : Math.min(arrayStart, objectStart);
  if (start === -1) throw new Error("Wrangler did not return JSON output.");
  return JSON.parse(output.slice(start));
}

function runWrangler(arguments_, options = {}) {
  const maximumAttempts = options.readOnly ? 3 : 1;
  let result;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    result = spawnSync(
      WRANGLER.executable,
      [...WRANGLER.argumentsPrefix, ...arguments_, "--cwd", "apps/api"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: CONFIRMED_ACCOUNT_ID,
        },
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (
      result.status === 0 ||
      !isRetryableWranglerFailure(result) ||
      attempt === maximumAttempts
    ) {
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 250);
  }
  if (options.allowFailure) return result;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(
      `Wrangler command failed (${arguments_.join(" ")}): ${result.error?.message ?? detail}`,
    );
  }
  return result.stdout ?? "";
}

function runR2BridgeClient(bridge, arguments_, options = {}) {
  const result = spawnSync(
    process.execPath,
    [R2_BRIDGE_CLIENT, ...arguments_],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        WASHPRO_R2_BRIDGE_TOKEN: bridge.token,
      },
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (options.allowNotFound && result.status === 44) return undefined;
  if (result.status !== 0) {
    throw new Error(
      `R2 bridge client failed (${arguments_[0]}): ${result.error?.message ?? result.stderr ?? "unknown error"}`,
    );
  }
  return result.stdout ?? "";
}

function startR2Bridge({ directory, remote }) {
  const port = remote ? 18794 : 18793;
  const token = randomBytes(32).toString("hex");
  const logPath = resolve(
    directory,
    remote ? "r2-remote-bridge.log" : "r2-local-bridge.log",
  );
  const log = openSync(logPath, "a");
  const arguments_ = [
    ...WRANGLER.argumentsPrefix,
    "dev",
    "scripts/r2-migration-bridge.mjs",
    ...(remote ? ["--env", TARGET_ENVIRONMENT] : ["--local"]),
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--var",
    `MIGRATION_BRIDGE_TOKEN:${token}`,
    "--cwd",
    "apps/api",
  ];
  const child = spawn(WRANGLER.executable, arguments_, {
    cwd: ROOT,
    detached: false,
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: CONFIRMED_ACCOUNT_ID,
    },
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  closeSync(log);
  const bridge = { baseUrl: `http://127.0.0.1:${port}`, child, token };
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const health = spawnSync(
      process.execPath,
      [R2_BRIDGE_CLIENT, "health", bridge.baseUrl],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          WASHPRO_R2_BRIDGE_TOKEN: token,
        },
        windowsHide: true,
      },
    );
    if (health.status === 0) return bridge;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  child.kill();
  throw new Error(
    `The ${remote ? "remote" : "local"} R2 migration bridge did not start. See ${relative(ROOT, logPath)}.`,
  );
}

function withR2Bridge({ directory, remote }, callback) {
  const bridge = startR2Bridge({ directory, remote });
  try {
    return callback(bridge);
  } finally {
    bridge.child.kill();
  }
}

function readConfig() {
  return parseJsonc(readFileSync(CONFIG_PATH, "utf8"));
}

function bindingByName(bindings, name) {
  return bindings?.find((binding) => binding.binding === name);
}

function getTargetBindings(config) {
  assertSafeTarget({
    accountId: config.account_id,
    targetEnv: TARGET_ENVIRONMENT,
  });
  const target = config.env?.[TARGET_ENVIRONMENT];
  const bindings = {
    database: bindingByName(target?.d1_databases, "DB"),
    invoices: bindingByName(target?.r2_buckets, "INVOICES"),
    kv: bindingByName(target?.kv_namespaces, "CACHE"),
    uploads: bindingByName(target?.r2_buckets, "UPLOADS"),
  };
  const errors = [];
  if (
    bindings.database?.database_name !== "washpro-dev" ||
    bindings.database?.database_id !== "f12e4f56-470a-488f-8e34-da502fe974d7" ||
    bindings.database?.remote !== true
  ) {
    errors.push("DB is not the confirmed washpro-dev remote binding.");
  }
  if (
    bindings.kv?.id !== "72cd173f952343269324e671d68147e6" ||
    bindings.kv?.remote !== true
  ) {
    errors.push("CACHE is not the confirmed remote development namespace.");
  }
  if (
    bindings.uploads?.bucket_name !== "washpro-uploads-dev" ||
    bindings.uploads?.remote !== true
  ) {
    errors.push("UPLOADS is not the confirmed development bucket.");
  }
  if (
    bindings.invoices?.bucket_name !== "washpro-invoices-dev" ||
    bindings.invoices?.remote !== true
  ) {
    errors.push("INVOICES is not the confirmed development bucket.");
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return bindings;
}

function locateD1Database(stateRoot) {
  const directory = resolve(stateRoot, "v3/d1/miniflare-D1DatabaseObject");
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => resolve(directory, name));
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one local D1 database in ${directory}; found ${candidates.length}.`,
    );
  }
  return candidates[0];
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function readDatabaseSnapshot(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  const selectedTables = selectMigrationTables(tables);
  const foreignKeys = tables.flatMap((table) =>
    database
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
      .all()
      .map((foreignKey) => ({
        from: foreignKey.from,
        table,
        to: foreignKey.to,
        toTable: foreignKey.table,
      })),
  );
  const importOrder = deriveImportOrder(selectedTables, foreignKeys);
  const tableData = importOrder.map((table) => {
    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map((column) => column.name);
    return {
      columns,
      rows: database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all(),
      table,
    };
  });
  const tableCounts = Object.fromEntries(
    tableData.map(({ rows, table }) => [table, rows.length]),
  );
  const idBounds = Object.fromEntries(
    tableData
      .filter(({ columns }) => columns.includes("id"))
      .map(({ rows, table }) => {
        const ids = rows.map((row) => row.id).filter((id) => id !== null);
        return [
          table,
          {
            maximum: ids.length > 0 ? ids.toSorted().at(-1) : null,
            minimum: ids.length > 0 ? ids.toSorted()[0] : null,
          },
        ];
      }),
  );
  const tableFingerprints = Object.fromEntries(
    tableData.map(({ columns, rows, table }) => [
      table,
      fingerprintRows(columns, rows),
    ]),
  );
  const integrity = database.prepare("PRAGMA integrity_check").all();
  const foreignKeyViolations = database
    .prepare("PRAGMA foreign_key_check")
    .all();
  database.close();
  return {
    fileAssets:
      tableData.find(({ table }) => table === "file_assets")?.rows ?? [],
    foreignKeyCount: foreignKeys.length,
    foreignKeyViolations,
    foreignKeys,
    idBounds,
    importOrder,
    integrity,
    selectedTables,
    skippedTables: tables.filter((table) => !selectedTables.includes(table)),
    tableCounts,
    tableData,
    tableFingerprints,
  };
}

function countPersistedR2Objects(stateRoot) {
  const directory = resolve(stateRoot, "v3/r2/miniflare-R2BucketObject");
  if (!existsSync(directory)) return 0;
  let total = 0;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".sqlite") || name === "metadata.sqlite") continue;
    const database = new DatabaseSync(resolve(directory, name), {
      readOnly: true,
    });
    total += Number(
      database.prepare("SELECT COUNT(*) AS n FROM _mf_objects").get().n,
    );
    database.close();
  }
  return total;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function objectBackupName(binding, key) {
  return `${binding.toLowerCase()}-${createHash("sha256").update(key).digest("hex")}.bin`;
}

function readKvKeysLocal() {
  const output = runWrangler(
    ["kv", "key", "list", "--binding", "CACHE", "--local", "--env", ""],
    { readOnly: true },
  );
  const keys = parseJsonOutput(output);
  return keys.map((entry) => ({
    key: entry.name,
    ...classifyKvKey(entry.name),
  }));
}

function backupR2Objects({ backupDirectory, persistedR2Objects }) {
  const manifests = { INVOICES: [], UPLOADS: [] };
  if (persistedR2Objects === 0) return manifests;
  withR2Bridge({ directory: backupDirectory, remote: false }, (bridge) => {
    for (const binding of ["UPLOADS", "INVOICES"]) {
      const objects = JSON.parse(
        runR2BridgeClient(bridge, ["list", bridge.baseUrl, binding]),
      );
      for (const object of objects) {
        const backupName = objectBackupName(binding, object.key);
        const outputPath = resolve(backupDirectory, "r2", backupName);
        mkdirSync(dirname(outputPath), { recursive: true });
        const metadata = JSON.parse(
          runR2BridgeClient(bridge, [
            "get",
            bridge.baseUrl,
            binding,
            object.key,
            outputPath,
          ]),
        );
        const actualSize = readFileSync(outputPath).byteLength;
        manifests[binding].push({
          actualSize,
          backupFile: relative(backupDirectory, outputPath),
          contentType: metadata.httpMetadata?.contentType,
          customMetadata: metadata.customMetadata ?? {},
          destinationBucket:
            binding === "UPLOADS"
              ? "washpro-uploads-dev"
              : "washpro-invoices-dev",
          httpMetadata: metadata.httpMetadata ?? {},
          key: object.key,
          sha256: sha256(outputPath),
          size: metadata.size,
          sourceBinding: binding,
          status: "backed-up",
        });
      }
    }
  });
  return manifests;
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function latestBackupDirectory() {
  const pointer = resolve(BACKUP_ROOT, ".latest");
  if (!existsSync(pointer)) {
    throw new Error(
      "No migration backup exists. Run the backup command first.",
    );
  }
  const directory = resolve(BACKUP_ROOT, readFileSync(pointer, "utf8").trim());
  if (!existsSync(directory))
    throw new Error(`Backup directory is missing: ${directory}`);
  return directory;
}

function createBackup() {
  if (!existsSync(LOCAL_STATE)) {
    throw new Error(`Local Wrangler state does not exist: ${LOCAL_STATE}`);
  }
  const name = timestamp();
  const directory = resolve(BACKUP_ROOT, name);
  mkdirSync(directory, { recursive: true });
  cpSync(LOCAL_STATE, resolve(directory, "wrangler-state"), {
    recursive: true,
  });

  const fullExport = resolve(directory, "washpro-local-full.sql");
  runWrangler([
    "d1",
    "export",
    "DB",
    "--local",
    "--output",
    fullExport,
    "--skip-confirmation",
    "--env",
    "",
  ]);

  const copiedDatabase = locateD1Database(resolve(directory, "wrangler-state"));
  const snapshot = readDatabaseSnapshot(copiedDatabase);
  assertLocalDatabaseHealthy(snapshot);
  const selectedDataFile = resolve(directory, "washpro-selected-data.sql");
  writeFileSync(selectedDataFile, buildDataOnlySql(snapshot.tableData), "utf8");

  const config = readConfig();
  getTargetBindings(config);
  const persistedR2Objects = countPersistedR2Objects(
    resolve(directory, "wrangler-state"),
  );
  const r2 = backupR2Objects({
    backupDirectory: directory,
    persistedR2Objects,
  });
  const manifestKeys = new Set(
    [...r2.INVOICES, ...r2.UPLOADS].map(
      (object) => `${object.sourceBinding}\0${object.key}`,
    ),
  );
  const referencedKeys = new Set(
    snapshot.fileAssets
      .filter((asset) => asset.upload_status === "READY")
      .map((asset) => `${asset.bucket_name}\0${asset.object_key}`),
  );
  const missingReferencedObjects = snapshot.fileAssets
    .filter(
      (asset) =>
        asset.upload_status === "READY" &&
        ["UPLOADS", "INVOICES"].includes(asset.bucket_name) &&
        !manifestKeys.has(`${asset.bucket_name}\0${asset.object_key}`),
    )
    .map((asset) => ({
      binding: asset.bucket_name,
      fileAssetId: asset.id,
      key: asset.object_key,
    }));
  const unreferencedObjectCount = [...manifestKeys].filter(
    (key) => !referencedKeys.has(key),
  ).length;
  const kv = readKvKeysLocal();
  const report = {
    accountId: CONFIRMED_ACCOUNT_ID,
    backupDirectory: relative(ROOT, directory),
    createdAt: new Date().toISOString(),
    database: {
      foreignKeyCount: snapshot.foreignKeyCount,
      foreignKeyViolations: snapshot.foreignKeyViolations,
      fullExport: basename(fullExport),
      idBounds: snapshot.idBounds,
      importOrder: snapshot.importOrder,
      integrity: snapshot.integrity,
      selectedDataFile: basename(selectedDataFile),
      selectedTables: snapshot.selectedTables,
      skippedTables: snapshot.skippedTables,
      tableCounts: snapshot.tableCounts,
      tableFingerprints: snapshot.tableFingerprints,
    },
    kv: {
      inspected: kv.length,
      keys: kv,
      migrated: 0,
      skipped: kv.length,
    },
    localPersistencePath: relative(ROOT, LOCAL_STATE),
    r2: {
      INVOICES: r2.INVOICES,
      missingReferencedObjects,
      UPLOADS: r2.UPLOADS,
      persistedObjectCount: persistedR2Objects,
      referencedObjectCount: [...manifestKeys].filter((key) =>
        referencedKeys.has(key),
      ).length,
      unreferencedObjectCount,
      unmappedObjectCount: 0,
    },
    targetEnvironment: TARGET_ENVIRONMENT,
  };
  writeJson(resolve(directory, "r2-uploads-manifest.json"), r2.UPLOADS);
  writeJson(resolve(directory, "r2-invoices-manifest.json"), r2.INVOICES);
  writeJson(resolve(directory, "backup-report.json"), report);
  appendMigrationLog(
    directory,
    `Backup completed: ${Object.values(snapshot.tableCounts).reduce((sum, count) => sum + count, 0)} selected D1 rows, ${persistedR2Objects} R2 objects, ${kv.length} active KV keys inspected.`,
  );
  writeFileSync(resolve(BACKUP_ROOT, ".latest"), `${name}\n`, "utf8");
  return report;
}

function extractD1Results(output) {
  const payload = parseJsonOutput(output);
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap((entry) => entry.results ?? []);
}

function getRemoteCounts(tables) {
  if (tables.length === 0) return {};
  const rows = [];
  for (const tableChunk of chunkItems(tables, D1_COUNT_QUERY_CHUNK_SIZE)) {
    const sql = tableChunk
      .map(
        (table) =>
          `SELECT '${table.replaceAll("'", "''")}' AS table_name, COUNT(*) AS row_count FROM ${quoteIdentifier(table)}`,
      )
      .join(" UNION ALL ");
    const output = runWrangler(
      [
        "d1",
        "execute",
        "DB",
        "--remote",
        "--env",
        TARGET_ENVIRONMENT,
        "--command",
        sql,
        "--json",
      ],
      { readOnly: true },
    );
    rows.push(...extractD1Results(output));
  }
  return Object.fromEntries(
    rows.map((row) => [row.table_name, Number(row.row_count)]),
  );
}

function migrationPreflight() {
  const config = readConfig();
  const bindings = getTargetBindings(config);
  const directory = latestBackupDirectory();
  const backup = JSON.parse(
    readFileSync(resolve(directory, "backup-report.json"), "utf8"),
  );
  assertLocalDatabaseHealthy(backup.database);
  const copiedDatabase = locateD1Database(resolve(directory, "wrangler-state"));
  const localSnapshot = readDatabaseSnapshot(copiedDatabase);
  assertLocalDatabaseHealthy(localSnapshot);
  const remoteCounts = getRemoteCounts(backup.database.selectedTables);
  const remoteFingerprints = {};
  for (const { columns, table } of localSnapshot.tableData) {
    const remoteRows = remoteCounts[table] === 0 ? [] : getRemoteRows(table);
    remoteFingerprints[table] = fingerprintRows(columns, remoteRows);
  }
  const d1Target = classifyD1TargetState({
    localCounts: localSnapshot.tableCounts,
    localFingerprints: localSnapshot.tableFingerprints,
    remoteCounts,
    remoteFingerprints,
    tables: localSnapshot.selectedTables,
  });
  const missingR2References = [...backup.r2.UPLOADS, ...backup.r2.INVOICES]
    .filter((object) => object.status !== "backed-up")
    .concat(backup.r2.missingReferencedObjects ?? []);
  const expectedR2ObjectCount =
    backup.r2.INVOICES.length + backup.r2.UPLOADS.length;
  const r2Preflight =
    expectedR2ObjectCount === 0
      ? { INVOICES: [], UPLOADS: [] }
      : withR2Bridge({ directory, remote: true }, (bridge) => ({
          INVOICES: inspectRemoteR2Objects(
            bridge,
            directory,
            "INVOICES",
            bindings.invoices.bucket_name,
            backup.r2.INVOICES,
          ),
          UPLOADS: inspectRemoteR2Objects(
            bridge,
            directory,
            "UPLOADS",
            bindings.uploads.bucket_name,
            backup.r2.UPLOADS,
          ),
        }));
  const r2Conflicts = [...r2Preflight.INVOICES, ...r2Preflight.UPLOADS].filter(
    (object) => object.status === "conflict",
  );
  const report = {
    accountId: CONFIRMED_ACCOUNT_ID,
    bindings: {
      databaseId: bindings.database.database_id,
      databaseName: bindings.database.database_name,
      invoicesBucket: bindings.invoices.bucket_name,
      kvNamespaceId: bindings.kv.id,
      uploadsBucket: bindings.uploads.bucket_name,
    },
    conflicts: {
      d1: d1Target.conflicts,
      r2: r2Conflicts,
    },
    d1TargetStatus: d1Target.status,
    estimatedOperations: {
      d1Inserts: Object.values(backup.database.tableCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      invoiceUploads: backup.r2.INVOICES.length,
      kvWrites: 0,
      uploadObjects: backup.r2.UPLOADS.length,
    },
    foreignKeyImportOrder: backup.database.importOrder,
    kv: backup.kv,
    localCounts: backup.database.tableCounts,
    missingDependencies:
      backup.r2.unmappedObjectCount === 0
        ? []
        : [
            `${backup.r2.unmappedObjectCount} local R2 objects are not represented by file_assets.`,
          ],
    missingR2References,
    remoteCounts,
    remoteFingerprints,
    r2: {
      invoiceBytes: backup.r2.INVOICES.reduce(
        (sum, object) => sum + (object.actualSize ?? 0),
        0,
      ),
      invoiceObjects: backup.r2.INVOICES.length,
      uploadBytes: backup.r2.UPLOADS.reduce(
        (sum, object) => sum + (object.actualSize ?? 0),
        0,
      ),
      uploadObjects: backup.r2.UPLOADS.length,
    },
    r2Preflight,
    selectedTables: backup.database.selectedTables,
    targetEnvironment: TARGET_ENVIRONMENT,
  };
  writeJson(resolve(directory, "migration-dry-run.json"), report);
  appendMigrationLog(
    directory,
    `Dry run completed for ${TARGET_ENVIRONMENT}: ${report.estimatedOperations.d1Inserts} D1 inserts, ${report.estimatedOperations.uploadObjects} uploads objects, ${report.estimatedOperations.invoiceUploads} invoice objects, 0 KV writes.`,
  );
  return { backup, bindings, directory, report };
}

function comparableMetadata(object) {
  const normalizeRecord = (record) =>
    Object.fromEntries(
      Object.entries(record ?? {})
        .map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value,
        ])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  return JSON.stringify({
    customMetadata: normalizeRecord(object.customMetadata),
    httpMetadata: normalizeRecord(
      object.httpMetadata ?? {
        ...(object.contentType ? { contentType: object.contentType } : {}),
      },
    ),
  });
}

function inspectRemoteR2Objects(bridge, directory, binding, bucket, objects) {
  const results = [];
  for (const object of objects) {
    if (object.status !== "backed-up") {
      results.push({ ...object, status: "missing-local-object" });
      continue;
    }
    const remoteCopy = resolve(
      directory,
      "remote-preflight",
      objectBackupName(binding, object.key),
    );
    mkdirSync(dirname(remoteCopy), { recursive: true });
    const metadataOutput = runR2BridgeClient(
      bridge,
      ["get", bridge.baseUrl, binding, object.key, remoteCopy],
      { allowNotFound: true },
    );
    if (metadataOutput !== undefined) {
      const remoteMetadata = JSON.parse(metadataOutput);
      const remoteHash = sha256(remoteCopy);
      const remoteSize = readFileSync(remoteCopy).byteLength;
      results.push({
        ...object,
        remoteHash,
        remoteMetadata,
        remoteSize,
        status:
          remoteHash === object.sha256 &&
          remoteSize === (object.actualSize ?? object.size) &&
          comparableMetadata(remoteMetadata) === comparableMetadata(object)
            ? "identical"
            : "conflict",
      });
      continue;
    }
    results.push({ ...object, status: "missing-remote-object" });
  }
  return results;
}

function copyR2Objects(bridge, directory, binding, bucket, objects) {
  const results = [];
  for (const object of objects) {
    if (object.status !== "backed-up") {
      throw new Error(`Local R2 object is missing: ${binding}/${object.key}`);
    }
    const source = resolve(directory, object.backupFile);
    const remoteCopy = resolve(
      directory,
      "remote-verification",
      objectBackupName(binding, object.key),
    );
    mkdirSync(dirname(remoteCopy), { recursive: true });
    const existingMetadata = runR2BridgeClient(
      bridge,
      ["get", bridge.baseUrl, binding, object.key, remoteCopy],
      { allowNotFound: true },
    );
    if (existingMetadata !== undefined) {
      const remoteHash = sha256(remoteCopy);
      const remoteSize = readFileSync(remoteCopy).byteLength;
      if (
        remoteHash !== object.sha256 ||
        remoteSize !== (object.actualSize ?? object.size) ||
        comparableMetadata(JSON.parse(existingMetadata)) !==
          comparableMetadata(object)
      ) {
        throw new Error(`R2 conflict: ${bucket}/${object.key}`);
      }
      results.push({ ...object, remoteHash, status: "skipped-identical" });
      continue;
    }
    const metadataPath = resolve(
      directory,
      "r2",
      `${objectBackupName(binding, object.key)}.metadata.json`,
    );
    writeJson(metadataPath, {
      customMetadata: object.customMetadata ?? {},
      httpMetadata: object.httpMetadata ?? {
        ...(object.contentType ? { contentType: object.contentType } : {}),
      },
    });
    runR2BridgeClient(bridge, [
      "put",
      bridge.baseUrl,
      binding,
      object.key,
      source,
      metadataPath,
    ]);
    const uploadedMetadata = runR2BridgeClient(bridge, [
      "get",
      bridge.baseUrl,
      binding,
      object.key,
      remoteCopy,
    ]);
    const remoteHash = sha256(remoteCopy);
    const remoteSize = readFileSync(remoteCopy).byteLength;
    if (
      remoteHash !== object.sha256 ||
      remoteSize !== (object.actualSize ?? object.size) ||
      comparableMetadata(JSON.parse(uploadedMetadata)) !==
        comparableMetadata(object)
    ) {
      throw new Error(`R2 verification hash mismatch: ${bucket}/${object.key}`);
    }
    results.push({ ...object, remoteHash, status: "uploaded-and-verified" });
  }
  return results;
}

function executeMigration() {
  const preflight = migrationPreflight();
  const { backup, bindings, directory, report } = preflight;
  if (
    report.conflicts.d1.length > 0 ||
    report.conflicts.r2.length > 0 ||
    report.missingDependencies.length > 0 ||
    report.missingR2References.length > 0
  ) {
    throw new Error(
      "Migration preflight found conflicts or missing dependencies.",
    );
  }
  let d1Status;
  if (
    report.d1TargetStatus === "empty" &&
    report.estimatedOperations.d1Inserts > 0
  ) {
    runWrangler([
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      TARGET_ENVIRONMENT,
      "--file",
      resolve(directory, backup.database.selectedDataFile),
      "--yes",
    ]);
    d1Status = "imported";
  } else if (report.d1TargetStatus === "exact-match") {
    d1Status = "already-migrated";
  } else {
    throw new Error("Remote D1 is neither empty nor an exact resumable match.");
  }

  const expectedR2ObjectCount =
    backup.r2.UPLOADS.length + backup.r2.INVOICES.length;
  const copied =
    expectedR2ObjectCount === 0
      ? { invoices: [], uploads: [] }
      : withR2Bridge({ directory, remote: true }, (bridge) => ({
          invoices: copyR2Objects(
            bridge,
            directory,
            "INVOICES",
            bindings.invoices.bucket_name,
            backup.r2.INVOICES,
          ),
          uploads: copyR2Objects(
            bridge,
            directory,
            "UPLOADS",
            bindings.uploads.bucket_name,
            backup.r2.UPLOADS,
          ),
        }));
  const { invoices, uploads } = copied;
  const result = {
    completedAt: new Date().toISOString(),
    d1Status,
    invoices,
    kvKeysMigrated: 0,
    targetEnvironment: TARGET_ENVIRONMENT,
    uploads,
  };
  writeJson(resolve(directory, "migration-execution.json"), result);
  appendMigrationLog(
    directory,
    `Execution completed: D1 ${d1Status}, ${uploads.length} uploads objects processed, ${invoices.length} invoice objects processed, 0 KV keys migrated.`,
  );
  return result;
}

function getRemoteRows(table) {
  const output = runWrangler(
    [
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      TARGET_ENVIRONMENT,
      "--command",
      `SELECT * FROM ${quoteIdentifier(table)}`,
      "--json",
    ],
    { readOnly: true },
  );
  return extractD1Results(output);
}

function verifyMigration() {
  const preflight = migrationPreflight();
  const { backup, directory, report } = preflight;
  const countMismatches = backup.database.selectedTables
    .filter(
      (table) =>
        backup.database.tableCounts[table] !== report.remoteCounts[table],
    )
    .map((table) => ({
      local: backup.database.tableCounts[table],
      remote: report.remoteCounts[table],
      table,
    }));
  const foreignKeyOutput = runWrangler(
    [
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      TARGET_ENVIRONMENT,
      "--command",
      "PRAGMA foreign_key_check",
      "--json",
    ],
    { readOnly: true },
  );
  const foreignKeyViolations = extractD1Results(foreignKeyOutput);
  const copiedDatabase = locateD1Database(resolve(directory, "wrangler-state"));
  const localSnapshot = readDatabaseSnapshot(copiedDatabase);
  const remoteIdBounds = {};
  const remoteFingerprints = {};
  for (const { columns, rows: localRows, table } of localSnapshot.tableData) {
    const remoteRows =
      report.remoteCounts[table] === 0 ? [] : getRemoteRows(table);
    remoteFingerprints[table] = fingerprintRows(columns, remoteRows);
    if (columns.includes("id")) {
      const ids = remoteRows
        .map((row) => row.id)
        .filter((id) => id !== null)
        .toSorted();
      remoteIdBounds[table] = {
        maximum: ids.length > 0 ? ids.at(-1) : null,
        minimum: ids.length > 0 ? ids[0] : null,
      };
    }
    if (localRows.length !== remoteRows.length) {
      remoteFingerprints[table] = "row-count-mismatch";
    }
  }
  const fingerprintMismatches = localSnapshot.selectedTables
    .filter(
      (table) =>
        localSnapshot.tableFingerprints[table] !== remoteFingerprints[table],
    )
    .map((table) => ({ table }));
  const idBoundMismatches = Object.keys(localSnapshot.idBounds)
    .filter(
      (table) =>
        JSON.stringify(localSnapshot.idBounds[table]) !==
        JSON.stringify(remoteIdBounds[table]),
    )
    .map((table) => ({
      local: localSnapshot.idBounds[table],
      remote: remoteIdBounds[table],
      table,
    }));
  const r2Verification = report.r2Preflight;
  const r2Mismatches = [
    ...r2Verification.INVOICES,
    ...r2Verification.UPLOADS,
  ].filter((object) => object.status !== "identical");
  const result = {
    countMismatches,
    fingerprintMismatches,
    foreignKeyViolations,
    idBoundMismatches,
    localIdBounds: localSnapshot.idBounds,
    localCounts: backup.database.tableCounts,
    missingR2References: report.missingR2References,
    remoteCounts: report.remoteCounts,
    remoteIdBounds,
    r2Mismatches,
    r2Verification,
    verifiedAt: new Date().toISOString(),
  };
  writeJson(resolve(directory, "migration-verification.json"), result);
  appendMigrationLog(
    directory,
    `Verification completed: ${countMismatches.length} count mismatches, ${fingerprintMismatches.length} fingerprint mismatches, ${idBoundMismatches.length} ID-bound mismatches, ${foreignKeyViolations.length} foreign-key violations, ${r2Mismatches.length} R2 mismatches.`,
  );
  if (
    countMismatches.length > 0 ||
    fingerprintMismatches.length > 0 ||
    foreignKeyViolations.length > 0 ||
    idBoundMismatches.length > 0 ||
    r2Mismatches.length > 0 ||
    result.missingR2References.length > 0
  ) {
    throw new Error("Migration verification failed.");
  }
  return result;
}

function verifyResources() {
  const config = readConfig();
  const bindings = getTargetBindings(config);
  const whoami = runWrangler(["whoami"], { readOnly: true });
  const d1 = runWrangler(["d1", "list"], { readOnly: true });
  const kv = runWrangler(["kv", "namespace", "list"], { readOnly: true });
  const r2 = runWrangler(["r2", "bucket", "list"], { readOnly: true });
  const checks = [
    [whoami, CONFIRMED_ACCOUNT_ID, "Cloudflare account"],
    [d1, bindings.database.database_id, "D1 ID"],
    [d1, bindings.database.database_name, "D1 name"],
    [kv, bindings.kv.id, "KV ID"],
    [r2, bindings.uploads.bucket_name, "uploads bucket"],
    [r2, bindings.invoices.bucket_name, "invoices bucket"],
  ];
  for (const [output, expected, label] of checks) {
    if (!output.includes(expected)) {
      throw new Error(`${label} was not found in the authenticated account.`);
    }
  }
  return {
    accountId: CONFIRMED_ACCOUNT_ID,
    databaseId: bindings.database.database_id,
    databaseName: bindings.database.database_name,
    invoicesBucket: bindings.invoices.bucket_name,
    kvNamespaceId: bindings.kv.id,
    status: "verified",
    uploadsBucket: bindings.uploads.bucket_name,
  };
}

function printSummary(label, value) {
  process.stdout.write(`${label}\n${JSON.stringify(value, jsonReplacer, 2)}\n`);
}

function main() {
  const options = parseMigrationArguments(process.argv.slice(2));
  let result;
  if (options.command === "verify-resources") {
    result = verifyResources();
    printSummary("Cloudflare development resources verified.", result);
  } else if (options.command === "backup") {
    result = createBackup();
    printSummary("Local migration backup completed.", {
      backupDirectory: result.backupDirectory,
      kvKeysInspected: result.kv.inspected,
      persistedR2Objects: result.r2.persistedObjectCount,
      tableCounts: result.database.tableCounts,
    });
  } else if (options.command === "migrate" && !options.execute) {
    result = migrationPreflight().report;
    printSummary(
      "Migration dry run completed; no remote writes were performed.",
      result,
    );
  } else if (options.command === "migrate" && options.execute) {
    result = executeMigration();
    printSummary("Migration execution completed.", result);
  } else if (options.command === "verify") {
    result = verifyMigration();
    printSummary("Migration verification completed.", result);
  } else {
    throw new Error(`Unknown migration command: ${options.command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Cloudflare migration failed: ${error.message}`);
  process.exitCode = 1;
}

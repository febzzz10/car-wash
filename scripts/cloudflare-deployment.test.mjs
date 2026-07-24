import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseConfigFileTextToJson } from "typescript";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const rootPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const apiPackage = JSON.parse(
  readFileSync(new URL("../apps/api/package.json", import.meta.url), "utf8"),
);
const wranglerPath = fileURLToPath(
  new URL("../apps/api/wrangler.jsonc", import.meta.url),
);
const parsedWrangler = parseConfigFileTextToJson(
  wranglerPath,
  readFileSync(wranglerPath, "utf8"),
);
assert.equal(parsedWrangler.error, undefined);

test("root deployment dispatches through the API npm workspace", () => {
  assert.equal(
    rootPackage.scripts["deploy:api"],
    "npm run deploy --workspace=@washpro/api",
  );
  assert.equal(apiPackage.scripts.deploy, 'wrangler deploy --env=""');
  assert.equal(
    apiPackage.scripts.build,
    'wrangler deploy --dry-run --env="" --outdir dist',
  );
  assert.equal(
    apiPackage.scripts.predeploy,
    "node scripts/validate-production-deploy.mjs",
  );
  assert.equal(
    apiPackage.scripts["premigrate:remote"],
    "node scripts/validate-production-deploy.mjs",
  );
});

test("Wrangler identifies the repository-connected Worker", () => {
  assert.equal(parsedWrangler.config.name, "car-wash");
  assert.equal(parsedWrangler.config.main, "src/index.ts");
});

test("remote development uses isolated Cloudflare resources while Worker code runs locally", () => {
  assert.equal(
    parsedWrangler.config.$schema,
    "../../node_modules/wrangler/config-schema.json",
  );

  const remoteDev = parsedWrangler.config.env?.["remote-dev"];
  assert.equal(remoteDev?.name, "car-wash-remote-dev");
  assert.deepEqual(remoteDev?.vars, {
    ALLOWED_ORIGINS: "http://localhost:5173",
    APP_ENV: "development",
    INVOICE_LINK_TTL_SECONDS: "604800",
    SESSION_TTL_SECONDS: "28800",
  });
  assert.deepEqual(remoteDev?.secrets?.required, [
    "BOOTSTRAP_TOKEN",
    "CSRF_SECRET",
    "INVOICE_TOKEN_PEPPER",
    "SESSION_PEPPER",
  ]);

  assert.deepEqual(
    remoteDev?.d1_databases?.map(({ binding }) => binding),
    ["DB"],
  );
  assert.equal(remoteDev?.d1_databases?.[0]?.database_name, "washpro-dev");
  assert.match(
    remoteDev?.d1_databases?.[0]?.database_id ?? "",
    /^[0-9a-f-]{36}$/i,
  );
  assert.equal(remoteDev?.d1_databases?.[0]?.migrations_dir, "migrations");
  assert.equal(remoteDev?.d1_databases?.[0]?.remote, true);

  assert.deepEqual(
    remoteDev?.kv_namespaces?.map(({ binding }) => binding),
    ["CACHE"],
  );
  assert.match(remoteDev?.kv_namespaces?.[0]?.id ?? "", /^[0-9a-f]{32}$/i);
  assert.equal(remoteDev?.kv_namespaces?.[0]?.remote, true);

  assert.deepEqual(
    remoteDev?.r2_buckets?.map(({ binding, bucket_name, remote }) => ({
      binding,
      bucket_name,
      remote,
    })),
    [
      {
        binding: "UPLOADS",
        bucket_name: "washpro-uploads-dev",
        remote: true,
      },
      {
        binding: "INVOICES",
        bucket_name: "washpro-invoices-dev",
        remote: true,
      },
    ],
  );

  assert.equal(apiPackage.scripts.dev, 'wrangler dev --env=""');
  assert.equal(
    apiPackage.scripts["dev:local"],
    'wrangler dev --local --env=""',
  );
  assert.equal(
    apiPackage.scripts["dev:remote"],
    "wrangler dev --env remote-dev",
  );
  assert.equal(
    apiPackage.scripts["build:remote-dev"],
    "wrangler deploy --dry-run --env remote-dev --outdir dist",
  );
  assert.equal(
    apiPackage.scripts["deploy:remote-dev"],
    "wrangler deploy --env remote-dev",
  );
  assert.equal(
    apiPackage.scripts["db:migrate:remote-dev"],
    "wrangler d1 migrations apply DB --remote --env remote-dev",
  );
  assert.equal(
    rootPackage.scripts["dev:api:local"],
    "npm run dev:local --workspace=@washpro/api",
  );
  assert.equal(
    rootPackage.scripts["dev:api:remote"],
    "npm run dev:remote --workspace=@washpro/api",
  );
  assert.equal(
    rootPackage.scripts["db:migrate:remote-dev"],
    "npm run db:migrate:remote-dev --workspace=@washpro/api",
  );
});

test("D1 integrity migrations use remote-parser-safe trigger bodies", () => {
  const integrityMigration = readFileSync(
    new URL(
      "../apps/api/migrations/0009_integrity_guards.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(integrityMigration, /SELECT\s+CASE\b/i);
  assert.match(
    integrityMigration,
    /CREATE TRIGGER tr_timer_events_validate_transition/i,
  );
  assert.match(
    integrityMigration,
    /CREATE TRIGGER tr_audit_no_sensitive_values/i,
  );
});

test("production preflight rejects local bindings and accepts complete production bindings", async () => {
  const validatorUrl = new URL(
    "../apps/api/scripts/validate-production-deploy.mjs",
    import.meta.url,
  );
  assert.equal(existsSync(validatorUrl), true);
  const { validateProductionConfig } = await import(validatorUrl.href);

  const localErrors = validateProductionConfig(parsedWrangler.config, {
    repositoryRoot,
  });
  assert.ok(localErrors.some((error) => error.includes("APP_ENV")));
  assert.ok(localErrors.some((error) => error.includes("DB")));
  assert.ok(localErrors.some((error) => error.includes("CACHE")));
  assert.ok(localErrors.some((error) => error.includes("UPLOADS")));
  assert.ok(localErrors.some((error) => error.includes("INVOICES")));

  const suffix = crypto.randomUUID().replaceAll("-", "");
  const productionConfig = structuredClone(parsedWrangler.config);
  productionConfig.name = "car-wash";
  productionConfig.vars = {
    ALLOWED_ORIGINS: `https://${suffix}.invalid`,
    APP_ENV: "production",
    INVOICE_LINK_TTL_SECONDS: "604800",
    SESSION_TTL_SECONDS: "28800",
  };
  productionConfig.d1_databases = [
    {
      binding: "DB",
      database_id: crypto.randomUUID(),
      database_name: `db-${suffix}`,
      migrations_dir: "migrations",
    },
  ];
  productionConfig.kv_namespaces = [{ binding: "CACHE", id: suffix }];
  productionConfig.r2_buckets = [
    { binding: "UPLOADS", bucket_name: `uploads-${suffix}` },
    { binding: "INVOICES", bucket_name: `invoices-${suffix}` },
  ];
  productionConfig.secrets = {
    required: [
      "BOOTSTRAP_TOKEN",
      "CSRF_SECRET",
      "INVOICE_TOKEN_PEPPER",
      "SESSION_PEPPER",
    ],
  };

  assert.deepEqual(
    validateProductionConfig(productionConfig, { repositoryRoot }),
    [],
  );
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseJsonc } from "../tools/cloudflare-migration/lib.mjs";

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
const parsedWrangler = {
  config: parseJsonc(readFileSync(wranglerPath, "utf8")),
};

test("root deployment dispatches through the API npm workspace", () => {
  assert.equal(
    rootPackage.scripts["deploy:api"],
    "npm run deploy --workspace=@washpro/api",
  );
  assert.equal(apiPackage.scripts.deploy, "wrangler deploy --env production");
  assert.equal(
    apiPackage.scripts["deploy:production"],
    "wrangler deploy --env production",
  );
  assert.equal(
    apiPackage.scripts.build,
    "wrangler deploy --dry-run --env production --outdir dist",
  );
  assert.equal(
    apiPackage.scripts.predeploy,
    "node scripts/validate-production-deploy.mjs",
  );
});

test("Wrangler identifies the repository-connected Worker", () => {
  assert.equal(
    parsedWrangler.config.account_id,
    "36c28c2516a8d4f17c0d010d6f12bf5f",
  );
  assert.equal(parsedWrangler.config.name, "car-wash");
  assert.equal(parsedWrangler.config.main, "src/index.ts");
});

test("top-level config uses dev-safe Cloudflare resources", () => {
  assert.equal(
    parsedWrangler.config.$schema,
    "../../node_modules/wrangler/config-schema.json",
  );

  assert.equal(parsedWrangler.config.vars.APP_ENV, "development");
  assert.equal(parsedWrangler.config.vars.ALLOWED_ORIGINS, "http://localhost:5173");

  assert.deepEqual(
    parsedWrangler.config.d1_databases?.map(({ binding, database_name, database_id }) => ({
      binding,
      database_name,
      database_id,
    })),
    [
      {
        binding: "DB",
        database_name: "washpro-dev",
        database_id: "f12e4f56-470a-488f-8e34-da502fe974d7",
      },
    ],
  );
  assert.deepEqual(
    parsedWrangler.config.kv_namespaces?.map(({ binding, id }) => ({
      binding,
      id,
    })),
    [{ binding: "CACHE", id: "72cd173f952343269324e671d68147e6" }],
  );
  assert.deepEqual(
    parsedWrangler.config.r2_buckets?.map(({ binding, bucket_name }) => ({
      binding,
      bucket_name,
    })),
    [
      { binding: "UPLOADS", bucket_name: "washpro-uploads-dev" },
      { binding: "INVOICES", bucket_name: "washpro-invoices-dev" },
    ],
  );
});

test("production environment uses production-safe config", () => {
  const production = parsedWrangler.config.env?.production;
  assert.equal(production?.name, "car-wash");
  assert.equal(production?.vars?.APP_ENV, "production");
  assert.equal(production?.vars?.ALLOWED_ORIGINS, "https://washpro-web.pages.dev,https://31b5ad05.washpro-web.pages.dev");
  assert.deepEqual(production?.secrets?.required, [
    "BOOTSTRAP_TOKEN",
    "CSRF_SECRET",
    "INVOICE_TOKEN_PEPPER",
    "SESSION_PEPPER",
  ]);
  assert.equal(production?.d1_databases?.[0]?.database_name, "washpro-dev");
  assert.equal(
    production?.d1_databases?.[0]?.database_id,
    "f12e4f56-470a-488f-8e34-da502fe974d7",
  );
  assert.equal(production?.kv_namespaces?.[0]?.id, "72cd173f952343269324e671d68147e6");
  assert.equal(production?.r2_buckets?.[0]?.bucket_name, "washpro-uploads-dev");
  assert.equal(production?.r2_buckets?.[1]?.bucket_name, "washpro-invoices-dev");
});

test("remote-dev environment mirrors dev-safe config", () => {
  const remoteDev = parsedWrangler.config.env?.["remote-dev"];
  assert.equal(remoteDev?.vars?.APP_ENV, "development");
  assert.equal(remoteDev?.vars?.ALLOWED_ORIGINS, "http://localhost:5173");
  assert.equal(remoteDev?.d1_databases?.[0]?.database_name, "washpro-dev");
  assert.equal(remoteDev?.kv_namespaces?.[0]?.id, "72cd173f952343269324e671d68147e6");
  assert.equal(remoteDev?.r2_buckets?.[0]?.bucket_name, "washpro-uploads-dev");
  assert.equal(remoteDev?.r2_buckets?.[1]?.bucket_name, "washpro-invoices-dev");
});

test("remote development scripts use explicit env flags", () => {
  assert.equal(apiPackage.scripts.dev, 'wrangler dev --env=""');
  assert.equal(
    apiPackage.scripts["dev:remote"],
    "wrangler dev --env remote-dev",
  );
  assert.equal(
    apiPackage.scripts["db:migrate:production"],
    "wrangler d1 migrations apply washpro-dev --remote --env production",
  );
  assert.equal(
    apiPackage.scripts["db:migrate:remote-dev"],
    "wrangler d1 migrations apply washpro-dev --remote --env remote-dev",
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

test("production preflight rejects dev-level config and accepts complete production config", async () => {
  const validatorUrl = new URL(
    "../apps/api/scripts/validate-production-deploy.mjs",
    import.meta.url,
  );
  assert.equal(existsSync(validatorUrl), true);
  const { validateProductionConfig } = await import(validatorUrl.href);

  const production = parsedWrangler.config.env?.production;
  const merged = { ...parsedWrangler.config, ...production };
  merged.vars = { ...parsedWrangler.config.vars, ...production.vars };
  merged.secrets = production.secrets ?? parsedWrangler.config.secrets;
  merged.d1_databases = production.d1_databases ?? parsedWrangler.config.d1_databases;
  merged.r2_buckets = production.r2_buckets ?? parsedWrangler.config.r2_buckets;
  merged.kv_namespaces = production.kv_namespaces ?? parsedWrangler.config.kv_namespaces;

  const prodErrors = validateProductionConfig(merged, {
    repositoryRoot,
  });
  assert.deepEqual(prodErrors, []);
});

test("root-level dev:api:local and migrate:local scripts are removed", () => {
  assert.equal(rootPackage.scripts["dev:api:local"], undefined);
  assert.equal(rootPackage.scripts["migrate:local"], undefined);
  assert.equal(rootPackage.scripts["setup:local"], undefined);
});

test("Pages Function proxy exists at functions/api/[[path]].ts", () => {
  const functionPath = fileURLToPath(
    new URL("../apps/web/functions/api/[[path]].ts", import.meta.url),
  );
  assert.equal(existsSync(functionPath), true);
  const content = readFileSync(functionPath, "utf8");
  assert.match(content, /env\.API\.fetch/);
});

test("Pages wrangler.jsonc has API service binding", () => {
  const pagesWranglerPath = fileURLToPath(
    new URL("../apps/web/wrangler.jsonc", import.meta.url),
  );
  const config = parseJsonc(readFileSync(pagesWranglerPath, "utf8"));
  assert.ok(config.services, "services array is defined");
  const apiBinding = config.services?.find(
    (s) => s.binding === "API" && s.service === "car-wash",
  );
  assert.ok(apiBinding, "API -> car-wash service binding exists");
});

test("assertAllowedOrigin accepts missing Origin header", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../apps/api/src/http/request.ts", import.meta.url)),
    "utf8",
  );
  assert.match(
    source,
    /if \(origin === undefined\) return/,
    "should early-return when Origin is undefined",
  );
});

test("frontend API_BASE defaults to empty string (relative /api/v1/ paths)", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../apps/web/src/lib/api.ts", import.meta.url)),
    "utf8",
  );
  assert.match(
    source,
    /API_BASE = import\.meta\.env\.VITE_API_BASE_URL \?\? ""/,
    "should default to empty string for same-origin API calls",
  );
});

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
  assert.equal(apiPackage.scripts.deploy, 'wrangler deploy --env=""');
  assert.equal(
    apiPackage.scripts.build,
    'wrangler deploy --dry-run --env="" --outdir dist',
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

test("top-level config uses production Cloudflare resources", () => {
  assert.equal(
    parsedWrangler.config.$schema,
    "../../node_modules/wrangler/config-schema.json",
  );

  assert.equal(parsedWrangler.config.vars.APP_ENV, "production");
  assert.equal(parsedWrangler.config.vars.ALLOWED_ORIGINS, "https://bab9bd69.washpro-web.pages.dev");

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



test("deployment and dev scripts use explicit empty env flags", () => {
  assert.equal(apiPackage.scripts.dev, 'wrangler dev --env=""');
  assert.equal(apiPackage.scripts.deploy, 'wrangler deploy --env=""');
  assert.equal(
    apiPackage.scripts["db:migrate"],
    "wrangler d1 migrations apply washpro-dev --remote",
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

test("production preflight validates top-level config directly", async () => {
  const validatorUrl = new URL(
    "../apps/api/scripts/validate-production-deploy.mjs",
    import.meta.url,
  );
  assert.equal(existsSync(validatorUrl), true);
  const { validateProductionConfig } = await import(validatorUrl.href);

  const prodErrors = validateProductionConfig(parsedWrangler.config, {
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

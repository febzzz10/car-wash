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
  assert.equal(
    apiPackage.scripts.deploy,
    'node scripts/validate-production-deploy.mjs && wrangler deploy --config wrangler.jsonc --env=""',
  );
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
  assert.ok(
    parsedWrangler.config.vars.ALLOWED_ORIGINS.includes("https://bab9bd69.washpro-web.pages.dev"),
    "ALLOWED_ORIGINS must contain the Pages origin",
  );
  assert.ok(
    parsedWrangler.config.vars.ALLOWED_ORIGINS.includes("https://washpro-web.xpersscarwash.workers.dev"),
    "ALLOWED_ORIGINS must contain the web Worker origin",
  );

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



test("deployment and dev scripts use explicit config and empty env flags", () => {
  assert.equal(apiPackage.scripts.dev, 'wrangler dev --env=""');
  assert.ok(
    apiPackage.scripts.deploy.includes('wrangler deploy --config wrangler.jsonc --env=""'),
    "API deploy must use explicit --config wrangler.jsonc",
  );
  assert.ok(
    apiPackage.scripts.deploy.includes("validate-production-deploy.mjs"),
    "API deploy must run production preflight",
  );
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

test("web Worker proxies /api/* and /invoice/* to car-wash service binding", () => {
  const workerPath = fileURLToPath(
    new URL("../apps/web/src/worker.ts", import.meta.url),
  );
  assert.equal(existsSync(workerPath), true);
  const content = readFileSync(workerPath, "utf8");
  assert.match(content, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(content, /env\.API\.fetch/);
  assert.match(content, /url\.pathname\.startsWith\("\/invoice\/"\)/);
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

test("web wrangler.jsonc uses washpro-web name and targets car-wash binding", () => {
  const webWranglerPath = fileURLToPath(
    new URL("../apps/web/wrangler.jsonc", import.meta.url),
  );
  const config = parseJsonc(readFileSync(webWranglerPath, "utf8"));
  assert.equal(config.name, "washpro-web", "Web Worker name must be washpro-web");
  const apiBinding = config.services?.find(
    (s) => s.binding === "API" && s.service === "car-wash",
  );
  assert.ok(apiBinding, "API -> car-wash service binding must exist");
});

test("web deploy validation script exists and rejects wrong names", () => {
  const validatorPath = new URL("../apps/web/scripts/validate-web-deploy.mjs", import.meta.url);
  assert.equal(existsSync(validatorPath), true);
});

test("web deploy validation script rejects wrong worker name", () => {
  const webPackage = JSON.parse(
    readFileSync(new URL("../apps/web/package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    webPackage.scripts.deploy.includes("validate-web-deploy.mjs"),
    "web deploy must run validation",
  );
});

test("web deploy script includes validation before wrangler", () => {
  const webPackage = JSON.parse(
    readFileSync(new URL("../apps/web/package.json", import.meta.url), "utf8"),
  );
  assert.ok(
    webPackage.scripts.deploy.includes("validate-web-deploy.mjs"),
    "web deploy must run web preflight",
  );
});

test("root deploy:web builds before deploying", () => {
  assert.ok(
    rootPackage.scripts["deploy:web"].includes("--filter @washpro/web build"),
    "root deploy:web must build the web app first",
  );
  assert.ok(
    rootPackage.scripts["deploy:web"].includes("validate-web-deploy.mjs"),
    "root deploy:web must validate before deploying",
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

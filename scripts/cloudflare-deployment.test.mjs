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
  assert.equal(apiPackage.scripts.deploy, "wrangler deploy");
  assert.equal(
    apiPackage.scripts.predeploy,
    "node scripts/validate-production-deploy.mjs",
  );
});

test("Wrangler identifies the repository-connected Worker", () => {
  assert.equal(parsedWrangler.config.name, "car-wash");
  assert.equal(parsedWrangler.config.main, "src/index.ts");
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

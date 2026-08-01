import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonc } from "../../../tools/cloudflare-migration/lib.mjs";

const REQUIRED_SECRETS = [
  "ADMIN_LOGIN_PASSWORD",
  "BOOTSTRAP_TOKEN",
  "CSRF_SECRET",
  "GEOCODE_CACHE_PEPPER",
  "INVOICE_TOKEN_PEPPER",
  "LOCATIONIQ_API_KEY",
  "SESSION_PEPPER",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KV_ID_PATTERN = /^[0-9a-f]{32}$/i;

function bindingByName(bindings, name) {
  return Array.isArray(bindings)
    ? bindings.find((binding) => binding?.binding === name)
    : undefined;
}

function isLocalName(value) {
  return (
    typeof value !== "string" ||
    value.trim() === "" ||
    /(^|[-_])local($|[-_])/i.test(value)
  );
}

function validatePositiveInteger(value, name, errors) {
  if (!/^\d+$/.test(String(value)) || Number(value) <= 0) {
    errors.push(`${name} must be a positive integer.`);
  }
}

export function validateProductionConfig(config, options = {}) {
  const errors = [];
  const repositoryRoot = options.repositoryRoot ?? resolve(process.cwd(), "../..");

  if (config?.name !== "car-wash") {
    errors.push('Worker name must be "car-wash".');
  }

  if (config?.main !== "src/index.ts") {
    errors.push('Worker entry point must be "src/index.ts".');
  } else {
    const apiRoot = resolve(repositoryRoot, "apps/api");
    const entryPoint = isAbsolute(config.main)
      ? config.main
      : resolve(apiRoot, config.main);
    if (!existsSync(entryPoint)) {
      errors.push(`Worker entry point does not exist: ${entryPoint}`);
    }
  }

  if (config?.vars?.APP_ENV !== "production") {
    errors.push('APP_ENV must be "production".');
  }

  const supportedAuthModes = ["static_admin", "hybrid_admin_staff"];
  if (!supportedAuthModes.includes(config?.vars?.AUTH_MODE)) {
    errors.push(
      `AUTH_MODE must be one of: ${supportedAuthModes.join(", ")}.`,
    );
  }

  const allowedOrigins = config?.vars?.ALLOWED_ORIGINS;
  if (typeof allowedOrigins !== "string" || allowedOrigins.trim() === "") {
    errors.push("ALLOWED_ORIGINS must contain the production web origin.");
  } else {
    for (const value of allowedOrigins.split(",")) {
      try {
        const origin = new URL(value.trim());
        if (
          origin.protocol !== "https:" ||
          origin.hostname === "localhost" ||
          origin.hostname === "127.0.0.1"
        ) {
          throw new Error("not a production HTTPS origin");
        }
      } catch {
        errors.push(
          `ALLOWED_ORIGINS contains an invalid production origin: ${value.trim() || "(empty)"}`,
        );
      }
    }
  }

  validatePositiveInteger(
    config?.vars?.SESSION_TTL_SECONDS,
    "SESSION_TTL_SECONDS",
    errors,
  );
  validatePositiveInteger(
    config?.vars?.INVOICE_LINK_TTL_SECONDS,
    "INVOICE_LINK_TTL_SECONDS",
    errors,
  );

  const database = bindingByName(config?.d1_databases, "DB");
  if (
    !database ||
    !UUID_PATTERN.test(database.database_id ?? "") ||
    isLocalName(database.database_name) ||
    database.migrations_dir !== "migrations"
  ) {
    errors.push(
      'DB must use the real production D1 UUID, a non-local database name, and migrations_dir "migrations".',
    );
  }

  const cache = bindingByName(config?.kv_namespaces, "CACHE");
  if (!cache || !KV_ID_PATTERN.test(cache.id ?? "")) {
    errors.push("CACHE must use the real 32-character production KV namespace ID.");
  }

  for (const bindingName of ["UPLOADS", "INVOICES"]) {
    const bucket = bindingByName(config?.r2_buckets, bindingName);
    if (!bucket || isLocalName(bucket.bucket_name)) {
      errors.push(
        `${bindingName} must use a real production R2 bucket name, not a local placeholder.`,
      );
    }
  }

  const doBindings = config?.durable_objects?.bindings;
  const doBinding = Array.isArray(doBindings)
    ? doBindings.find((b) => b?.name === "NOMINATIM_THROTTLE")
    : undefined;
  if (!doBinding || doBinding.class_name !== "NominatimThrottle") {
    errors.push("NOMINATIM_THROTTLE Durable Object binding must be configured with class_name 'NominatimThrottle'.");
  }

  const baseUrl = config?.vars?.LOCATIONIQ_BASE_URL;
  if (typeof baseUrl !== "string" || !["https://us1.locationiq.com", "https://eu1.locationiq.com"].includes(baseUrl)) {
    errors.push("LOCATIONIQ_BASE_URL must be https://us1.locationiq.com or https://eu1.locationiq.com.");
  }

  const userAgent = config?.vars?.GEOCODE_USER_AGENT;
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    errors.push("GEOCODE_USER_AGENT must be set.");
  }

  const ttl = Number(config?.vars?.GEOCODE_CACHE_TTL_SECONDS);
  if (!Number.isInteger(ttl) || ttl < 300 || ttl > 172800) {
    errors.push("GEOCODE_CACHE_TTL_SECONDS must be an integer between 300 and 172800.");
  }

  const requiredSecrets = config?.secrets?.required;
  for (const secret of REQUIRED_SECRETS) {
    if (!Array.isArray(requiredSecrets) || !requiredSecrets.includes(secret)) {
      errors.push(`Required Worker secret is not declared: ${secret}.`);
    }
  }

  return errors;
}

function readWranglerConfig(configPath) {
  return parseJsonc(readFileSync(configPath, "utf8"));
}

function run() {
  const apiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const configPath = resolve(apiRoot, "wrangler.jsonc");
  const repositoryRoot = resolve(apiRoot, "../..");
  const config = readWranglerConfig(configPath);

  const errors = validateProductionConfig(config, {
    repositoryRoot,
  });

  if (errors.length > 0) {
    console.error("WashPro production deployment was blocked:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    console.error(
      "No Wrangler deployment was attempted. Configure real production bindings and variables first.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("WashPro production deployment preflight passed.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}

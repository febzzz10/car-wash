import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonc } from "../../../tools/cloudflare-migration/lib.mjs";

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function bindingByName(bindings, name) {
  return Array.isArray(bindings)
    ? bindings.find((binding) => binding?.binding === name)
    : undefined;
}

export function validateWebConfig(config, options = {}) {
  const errors = [];
  const configDir = options.configDir;

  if (config?.name !== "washpro-web") {
    errors.push(`Worker name must be "washpro-web", got "${config?.name ?? "(undefined)"}".`);
  }

  const apiBinding = bindingByName(config?.services, "API");
  if (!apiBinding) {
    errors.push('Service binding "API" is missing.');
  } else if (apiBinding.service !== "car-wash") {
    errors.push(`API service binding must target "car-wash", got "${apiBinding.service}".`);
  }

  if (config?.assets?.directory === undefined) {
    errors.push("Assets directory is not configured.");
  } else if (configDir) {
    const assetsPath = resolve(configDir, config.assets.directory);
    if (!existsSync(assetsPath)) {
      errors.push(`Assets directory does not exist: ${assetsPath}`);
    }
  }

  if (config?.workers_dev !== true) {
    errors.push('workers_dev must be true for the web Worker.');
  }

  return errors;
}

function readConfig(configPath) {
  const content = readFileSync(configPath, "utf8");
  return parseJsonc(content);
}

function run() {
  const generatedDir = resolve(WEB_ROOT, "dist", "washpro_web");
  const generatedConfigPath = resolve(generatedDir, "wrangler.json");

  let usedConfigPath = null;
  let config = null;

  if (existsSync(generatedConfigPath)) {
    config = readConfig(generatedConfigPath);
    usedConfigPath = generatedConfigPath;
  }

  if (config === null) {
    const sourceConfigPath = resolve(WEB_ROOT, "wrangler.jsonc");
    if (existsSync(sourceConfigPath)) {
      config = readConfig(sourceConfigPath);
      usedConfigPath = sourceConfigPath;
    }
  }

  if (config === null) {
    console.error("WashPro web deployment was blocked: no Wrangler configuration found.");
    process.exitCode = 1;
    return;
  }

  const errors = validateWebConfig(config, { configDir: resolve(usedConfigPath, "..") });

  if (errors.length > 0) {
    console.error(`WashPro web deployment was blocked (config: ${usedConfigPath}):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    console.error("No Wrangler deployment was attempted.");
    process.exitCode = 1;
    return;
  }

  console.log(`WashPro web deployment preflight passed (config: ${usedConfigPath}).`);
  console.log(`  Worker name: ${config.name}`);
  console.log(`  API binding: ${config.services?.[0]?.service ?? "(none)"}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}

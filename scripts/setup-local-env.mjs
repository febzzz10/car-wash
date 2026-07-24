import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const destination = resolve("apps/api/.dev.vars");
const force = process.argv.includes("--force");

if (existsSync(destination) && !force) {
  console.error(
    "apps/api/.dev.vars already exists. Nothing changed; use --force only when rotating all local secrets.",
  );
  process.exitCode = 1;
} else {
  const secret = () => randomBytes(32).toString("base64url");
  const values = [
    "ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173",
    `BOOTSTRAP_TOKEN=${secret()}`,
    `CSRF_SECRET=${secret()}`,
    `INVOICE_TOKEN_PEPPER=${secret()}`,
    `SESSION_PEPPER=${secret()}`,
  ];
  writeFileSync(destination, `${values.join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(
    "Created apps/api/.dev.vars with cryptographically random local secrets. The file is ignored by version control.",
  );
}

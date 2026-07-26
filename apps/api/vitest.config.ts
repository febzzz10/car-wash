import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          ALLOWED_ORIGINS: "https://washpro.test",
          APP_ENV: "test",
          AUTH_MODE: "static_admin",
          BOOTSTRAP_TOKEN:
            "test-bootstrap-token-must-be-at-least-32-characters",
          CSRF_SECRET: "test-csrf-secret-not-for-production",
          INVOICE_TOKEN_PEPPER: "test-invoice-pepper-not-for-production",
          SESSION_PEPPER: "test-session-pepper-not-for-production",
          TEST_MIGRATIONS: await readD1Migrations(
            decodeURIComponent(
              new URL("./migrations", import.meta.url).pathname,
            ).replace(/^\/([A-Za-z]:)/u, "$1"),
          ),
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["pdf-lib"],
        },
      },
    },
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

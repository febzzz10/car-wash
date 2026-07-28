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
          GEOCODE_CACHE_PEPPER: "test-geocode-pepper-not-for-production",
          GEOCODE_CACHE_TTL_SECONDS: "172800",
          GEOCODE_USER_AGENT: "WashProTest/1.0",
          INVOICE_TOKEN_PEPPER: "test-invoice-pepper-not-for-production",
          LOCATIONIQ_API_KEY: "test-locationiq-key",
          LOCATIONIQ_BASE_URL: "https://us1.locationiq.com",
          SESSION_PEPPER: "test-session-pepper-not-for-production",
          TEST_MIGRATIONS: await readD1Migrations(
            decodeURIComponent(
              new URL("./migrations", import.meta.url).pathname,
            ).replace(/^\/([A-Za-z]:)/u, "$1"),
          ),
        },
        durableObjects: {
          NOMINATIM_THROTTLE: "NominatimThrottle",
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

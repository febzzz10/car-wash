import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 7_000 },
  fullyParallel: true,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  retries: 0,
  testDir: "./e2e",
  timeout: 40_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run dev --workspace @washpro/web -- --host 127.0.0.1 --port 4173",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4173/login",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 1440 },
      },
    },
    { name: "chromium-android", use: { ...devices["Pixel 7"] } },
    { name: "chromium-tablet", use: { ...devices["Galaxy Tab S4"] } },
    {
      name: "firefox-desktop",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { height: 900, width: 1440 },
      },
    },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
});

import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8099",
    trace: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: "node tests/e2e/server.js",
    url: "http://127.0.0.1:8099/healthz",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

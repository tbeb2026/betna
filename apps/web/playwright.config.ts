import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Next dev writes route manifests while the first pages compile. Serializing
  // the low-bandwidth portal smoke suite avoids competing manifest writes.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  webServer: [
    {
      command: "node e2e/mock-auth-api.mjs",
      cwd: ".",
      env: { ...process.env, MOCK_API_PORT: "4400" },
      url: "http://127.0.0.1:4400/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm dev",
      cwd: ".",
      env: {
        ...process.env,
        NODE_ENV: "test",
        BETNA_TEST_AUTH: "1",
        WEB_PORT: "3100",
        API_INTERNAL_URL: "http://127.0.0.1:4400",
      },
      url: "http://127.0.0.1:3100/en",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

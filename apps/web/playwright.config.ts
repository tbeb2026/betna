import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Next dev writes route manifests while the first pages compile. Serializing
  // the low-bandwidth portal smoke suite avoids competing manifest writes.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  webServer: {
    command: "pnpm dev",
    cwd: ".",
    env: { ...process.env, NODE_ENV: "test", BETNA_TEST_AUTH: "1", WEB_PORT: "3100" },
    url: "http://127.0.0.1:3100/en",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

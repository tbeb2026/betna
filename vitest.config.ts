import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/**/*.test.ts",
      "apps/**/src/**/*.{test,spec}.ts",
      "packages/**/src/**/*.{test,spec}.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "apps/**/e2e/**",
      "apps/**/test/**",
      "apps/api/prisma/**",
      ".next/**",
    ],
  },
});

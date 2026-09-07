import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**", "dist/**"],
    // Suites that touch Postgres share tables, so they must not interleave.
    // Redis keys are namespaced per suite, but the database is not.
    fileParallelism: false,
    setupFiles: ["src/test/setup.ts"],
  },
});

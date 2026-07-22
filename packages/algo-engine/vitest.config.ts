import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 50,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "node",
    globals: false,
  },
});

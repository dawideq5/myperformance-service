import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "build_keycloak",
      "dist_keycloak_theme",
      "panels/*/node_modules/**",
      // Playwright e2e — uruchamiane przez `npm run test:e2e`, NIE vitest
      "e2e/**",
      "**/*.spec.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: [
        "node_modules",
        ".next",
        "build_keycloak",
        "dist_keycloak_theme",
        "src/keycloak-theme/**",
        "**/*.config.*",
        "**/*.d.ts",
      ],
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";

export default defineConfig({
  publicDir: "src/keycloak-theme/public",
  build: {
    outDir: ".keycloak-theme-build",
    emptyOutDir: true,
    sourcemap: false,
  },
  plugins: [
    react(),
    keycloakify({
      themeName: "myperformance",
      accountThemeImplementation: "none",
      keycloakifyBuildDirPath: "build_keycloak",
    }),
  ],
});

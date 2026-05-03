import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { keycloakify } from "keycloakify/vite-plugin";

export default defineConfig({
  // No public dir for the keycloak-theme build — fonts live under
  // src/keycloak-theme/fonts/ and are referenced via `url(./fonts/...)`
  // in styles.css so Vite resolves + hashes them as proper assets.
  publicDir: false,
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

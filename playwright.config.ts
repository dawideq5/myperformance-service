import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config dla smoke E2E testów myperformance-dashboard.
 *
 * Uruchomienie lokalnie (wymaga `npx playwright install chromium`):
 *   npm run test:e2e
 *
 * CI: oddzielna workflow w `.github/workflows/e2e.yml` (opcjonalnie —
 * wymaga uruchomienia całego stacku z mockami KC, więc nie blokujemy
 * głównego CI).
 *
 * Smoke scope (e2e/):
 *   - login.spec.ts — flow: /login → KC redirect (mocked) → /dashboard render
 *   - dashboard.spec.ts — kafelki widoczne tylko z odpowiednimi rolami
 *   - admin-users.spec.ts — list + filter + permission edit
 *
 * Test env: BASE_URL przez env (default http://localhost:3000), KC mock przez
 * MSW (lib/test/msw-handlers.ts) — bez prawdziwego KC. Każdy test resetuje
 * cookies + storage.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Firefox + WebKit zakomentowane — domyślnie tylko chromium dla speed.
    // Włącz przy regression testing dla cross-browser issues.
    // { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],

  // Webserver auto-start NIE włączony — operator uruchamia `npm run dev`
  // ręcznie. CI workflow ma osobny step `npm run build && npm start &`.
  // webServer: {
  //   command: "npm run dev",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120_000,
  // },
});

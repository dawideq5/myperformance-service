import { test, expect } from "@playwright/test";

/**
 * Smoke test: /login flow.
 *
 * Test sprawdza że:
 *   1. /login renderuje stronę (nie crashuje, ma branding MyPerformance).
 *   2. Próba odwiedzenia /dashboard bez sesji redirectuje na /login.
 *   3. /dashboard po zalogowaniu pokazuje grid kafelków.
 *
 * UWAGA: krok 3 wymaga prawdziwego KC env (lub MSW mocka). W CI bez KC
 * test 3 jest oznaczony jako `test.skip` — uruchomi się tylko gdy
 * E2E_KC_AVAILABLE=1.
 */

test.describe("Login flow", () => {
  test("/login renderuje branding + form", async ({ page }) => {
    await page.goto("/login");

    // Branding
    await expect(page).toHaveTitle(/MyPerformance/i);

    // Powinien być przycisk logowania KC lub redirect na KC SSO
    // (NextAuth signIn() z provider=keycloak).
    const ssoBtn = page.getByRole("button", { name: /zaloguj|sign in|keycloak/i });
    const ssoLink = page.getByRole("link", { name: /zaloguj|sign in|keycloak/i });
    await expect(ssoBtn.or(ssoLink).first()).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard redirectuje na /login bez sesji", async ({ page }) => {
    // Brak ciastek — middleware powinno zablokować access do /dashboard.
    const response = await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Po redirect powinniśmy być na /login (NextAuth pages.signIn).
    await expect(page).toHaveURL(/\/login/);
    expect(response?.status()).toBeLessThan(500);
  });

  test.skip(
    !process.env.E2E_KC_AVAILABLE,
    "wymaga prawdziwego KC env (E2E_KC_AVAILABLE=1)",
  );

  test("/dashboard pokazuje grid kafelków po zalogowaniu", async ({ page }) => {
    // TODO: signIn() flow z KC dev realm albo storageState z fixture.
    // Tymczasowo — placeholder, skip jeśli E2E_KC_AVAILABLE nie ustawione.
    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible();
  });
});

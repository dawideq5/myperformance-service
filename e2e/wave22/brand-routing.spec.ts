import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — brand routing smoke (F1).
 *
 * Pełna logika resolverwa brandów (lokacja sales → service → mp_branding
 * default → fallback "myperformance") jest pinowana przez Vitest:
 * `lib/__tests__/wave22/brand-routing.test.ts` — tam mokujemy
 * getService/getLocation/getBranding i sprawdzamy każdą gałąź.
 *
 * Tutaj robimy tylko anonimowy smoke: app się buduje, nie crashuje na
 * branding helperach. Konkretne assertion'y na From: zaadresowane są
 * w testach jednostkowych.
 */

test.describe("Wave 22 / F1 — brand routing (anonymous smoke)", () => {
  test("/login renderuje się — brand resolver nie crashuje boot'a", async ({
    page,
  }) => {
    const res = await page.goto("/login", { waitUntil: "domcontentloaded" });
    expect(res?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveTitle(/MyPerformance/i);
  });

  test("/api/health zwraca 200 — pipeline brandowych helperów nie psuje cold start", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
  });
});

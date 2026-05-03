import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — invalidate guards smoke (F8).
 *
 * Pełna logika guardów (sprzedawca nie może unieważnić podpisanego dokumentu;
 * sprzedawca nie może unieważnić po przyjęciu na diagnozę; realm-admin może
 * przez `?force=true`) jest pinowana przez Vitest:
 * `lib/__tests__/invalidate-guards.test.ts`.
 *
 * Tutaj smoke: endpoint invalidate-electronic / invalidate-paper jest
 * zamontowany i 401-gated bez sesji.
 */

const FAKE_SVC = "00000000-0000-0000-0000-000000000001";

test.describe("Wave 22 / F8 — invalidate guards (anonymous smoke)", () => {
  test("POST /invalidate-electronic bez sesji → 401", async ({ request }) => {
    const res = await request.post(
      `/api/panel/services/${FAKE_SVC}/invalidate-electronic`,
      { data: {} },
    );
    expect(res.status()).toBe(401);
  });

  test("POST /invalidate-paper bez sesji → 401", async ({ request }) => {
    const res = await request.post(
      `/api/panel/services/${FAKE_SVC}/invalidate-paper`,
      { data: {} },
    );
    expect(res.status()).toBe(401);
  });
});

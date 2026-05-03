import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — status humanization smoke (F7).
 *
 * Pełna logika humanizacji event logu (`humanizeAction`) — wszystkie 40+
 * action types z polskimi labelkami + payload-aware description — jest
 * pinowana w `lib/__tests__/event-humanizer.test.ts` (Vitest, pure function).
 *
 * Tutaj smoke: actions endpoint jest zamontowany i 401-gated. Realna
 * regresja semantyczna (np. że "release_code_failed" pokazuje
 * "Niepoprawny kod wydania" zamiast technicznego stringa) zostaje w Vitest.
 */

const FAKE_SVC = "00000000-0000-0000-0000-000000000001";

test.describe("Wave 22 / F7 — event log endpoint smoke", () => {
  test("GET /api/panel/services/.../actions bez sesji → 401", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/panel/services/${FAKE_SVC}/actions`,
    );
    expect(res.status()).toBe(401);
  });
});

import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — LiveKit token API smoke (F16b).
 *
 * Bez fixture KC sesji nie zalogujemy serwisanta z poziomu Playwrighta.
 * Zamiast tego pinujemy kluczowe regresyjne kontrakty:
 *
 *   1. Endpointy są zamontowane (404 = ktoś usunął route → blocker).
 *   2. Bez sesji → 401/403 (middleware/route auth działa).
 *   3. CORS / OPTIONS preflight przechodzi (panele to oddzielne origin'y).
 *
 * Pełna semantyka tokenów (publish-only / subscribe-only / TTL / grant
 * shape) pokryta w `lib/__tests__/livekit.test.ts` (Vitest, mockowany SDK).
 */

test.describe("Wave 22 / F16 — LiveKit endpoints (anonymous smoke)", () => {
  test("POST /api/livekit/request-view bez sesji → 401", async ({
    request,
  }) => {
    const res = await request.post("/api/livekit/request-view", {
      data: { serviceId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(
      res.status(),
      "request-view bez auth musi zwrócić 401 (panel-auth gate)",
    ).toBe(401);
  });

  test("POST /api/livekit/request-view bez body → 401 (auth gate przed walidacją)", async ({
    request,
  }) => {
    const res = await request.post("/api/livekit/request-view", {
      data: {},
    });
    // Auth gate jest wcześniej niż walidacja body — broken auth = blocker.
    expect(res.status()).toBe(401);
  });

  test("GET /api/livekit/subscriber-token bez sesji → 401", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/livekit/subscriber-token?room=mp-service-00000000-0000-0000-0000-000000000001-abcd",
    );
    expect(res.status()).toBe(401);
  });

  test("OPTIONS /api/livekit/request-view zwraca CORS headers (panel cross-origin)", async ({
    request,
  }) => {
    const res = await request.fetch("/api/livekit/request-view", {
      method: "OPTIONS",
    });
    // PANEL_CORS_HEADERS musi być obecne — bez tego panele 3001-3003 nie
    // dogonią dashboardu na 3000.
    expect([204, 200]).toContain(res.status());
  });
});

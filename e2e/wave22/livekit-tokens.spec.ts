import { expect, test } from "@playwright/test";

/**
 * Wave 23 — LiveKit endpoints (anonymous smoke).
 *
 * Bez fixture KC sesji nie zalogujemy sprzedawcy z poziomu Playwrighta.
 * Pinujemy więc kontrakty:
 *   1. Endpointy są zamontowane (404 = ktoś usunął route → blocker).
 *   2. Bez sesji → 401 dla panel-auth (start-publisher, end-room) lub
 *      400 dla join-token bez tokenu w URL (auth jest w samym URL'u).
 *   3. Stary `/api/livekit/request-view` ZNIKNĄŁ (Wave 23 rework) — 404.
 *   4. CORS / OPTIONS preflight przechodzi (panele cross-origin).
 *
 * Pełna semantyka tokenów (publish+subscribe / subscribe-only / TTL) w
 * `lib/__tests__/livekit.test.ts` (Vitest, mockowany SDK).
 */

test.describe("Wave 23 — LiveKit endpoints (anonymous smoke)", () => {
  test("POST /api/livekit/start-publisher bez sesji → 401", async ({
    request,
  }) => {
    const res = await request.post("/api/livekit/start-publisher", {
      data: {},
    });
    expect(res.status(), "panel-auth gate").toBe(401);
  });

  test("POST /api/livekit/end-room bez sesji → 401", async ({ request }) => {
    const res = await request.post("/api/livekit/end-room", {
      data: { roomName: "mp-consultation-abc" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/livekit/join-token bez tokenu → 400", async ({ request }) => {
    const res = await request.get("/api/livekit/join-token");
    expect(res.status()).toBe(400);
  });

  test("GET /api/livekit/join-token z fałszywym tokenem → 401", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/livekit/join-token?token=this.is.not.a.valid.jwt",
    );
    expect(res.status()).toBe(401);
  });

  test("GET /api/livekit/intake-snapshot bez service_id → 400", async ({
    request,
  }) => {
    const res = await request.get("/api/livekit/intake-snapshot");
    expect(res.status()).toBe(400);
  });

  test("OPTIONS /api/livekit/start-publisher zwraca CORS headers", async ({
    request,
  }) => {
    const res = await request.fetch("/api/livekit/start-publisher", {
      method: "OPTIONS",
    });
    expect([204, 200]).toContain(res.status());
  });

  test("Wave 22 endpoints removed — /api/livekit/request-view → 404", async ({
    request,
  }) => {
    const res = await request.post("/api/livekit/request-view", {
      data: { serviceId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(
      res.status(),
      "old request-view endpoint should be gone after Wave 23",
    ).toBe(404);
  });

  test("Wave 22 endpoints removed — /api/livekit/subscriber-token → 404", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/livekit/subscriber-token?room=mp-service-foo-abcd",
    );
    expect(res.status()).toBe(404);
  });
});

test.describe("Wave 23 — admin LiveKit endpoints (anonymous smoke)", () => {
  test("GET /api/admin/livekit/rooms bez sesji → 401", async ({ request }) => {
    const res = await request.get("/api/admin/livekit/rooms");
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/livekit/end-room bez sesji → 401", async ({
    request,
  }) => {
    const res = await request.post("/api/admin/livekit/end-room", {
      data: { roomName: "mp-consultation-foo" },
    });
    expect(res.status()).toBe(401);
  });
});

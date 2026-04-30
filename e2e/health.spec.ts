import { test, expect } from "@playwright/test";

/**
 * Smoke test: /api/health endpoint.
 *
 * Najlżejszy możliwy test — sprawdza że proces Next.js w ogóle żyje.
 * Używany w deploy pipeline jako readiness probe.
 */

test.describe("Health endpoint", () => {
  test("/api/health zwraca 200 + JSON z `status`", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(["ok", "healthy", "ready"]).toContain(body.status);
  });

  test("/api/health response time < 1000ms (production target)", async ({
    request,
  }) => {
    const start = Date.now();
    const response = await request.get("/api/health");
    const elapsed = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(elapsed).toBeLessThan(1000);
  });
});

import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — Documenso disableEmails smoke (F1).
 *
 * Główne pinowanie regresji jest w Vitest
 * (`lib/__tests__/wave22/documenso-disable-emails.test.ts`) — tam czytamy
 * source 3 panelowych route'ów i potwierdzamy że `disableEmails: true`
 * pojawia się w wywołaniu `createDocumentForSigning`.
 *
 * Tutaj weryfikujemy jedynie że:
 *   1. Trzy route'y (send-electronic, sign-paper, annex) są zamontowane
 *      (404 = ktoś usunął endpoint → blocker).
 *   2. Bez sesji każdy z nich rzuca 401 — auth gate przed route logic.
 *
 * Pełen end-to-end (klient dostaje brandowanego maila Postal zamiast
 * domyślnego od Documenso) wymaga mockowania zarówno Documenso jak Postal —
 * zostawione dla integracji manualnej, dokumentowanej w runbooku F1.
 */

const FAKE_SVC = "00000000-0000-0000-0000-000000000001";

test.describe("Wave 22 / F1 — Documenso route smokes", () => {
  for (const route of [
    `/api/panel/services/${FAKE_SVC}/send-electronic`,
    `/api/panel/services/${FAKE_SVC}/sign-paper`,
    `/api/panel/services/${FAKE_SVC}/annex`,
  ]) {
    test(`POST ${route} bez sesji → 401`, async ({ request }) => {
      const res = await request.post(route, { data: {} });
      expect(
        res.status(),
        `${route} bez auth musi zwrócić 401 — auth gate broken albo route usunięty`,
      ).toBe(401);
    });
  }
});

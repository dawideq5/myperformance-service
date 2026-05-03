import { expect, test } from "@playwright/test";

/**
 * Wave 22 / F19 — SMS Chatwoot/Twilio smoke (F13).
 *
 * Critical bug fix: kod wydania (release_code) szedł przez generic
 * `sendServiceMessage` zamiast Chatwoot SMS inboxu. F13 zmienił
 * `lib/services/notify-release-code.ts` żeby używał `sendCustomerSms`
 * (Chatwoot platform API + `CHATWOOT_SMS_INBOX_ID`).
 *
 * Pełen flow (find-or-create contact, find-or-create conv w SMS inboxie,
 * post message, error tagging) pinowany w
 * `lib/__tests__/chatwoot-customer-sms.test.ts` (Vitest + mocked fetch).
 *
 * Tutaj smoke: wszystkie panelowe customer-messages endpoints są
 * zamontowane i 401-gated.
 */

const FAKE_SVC = "00000000-0000-0000-0000-000000000001";

test.describe("Wave 22 / F13 — SMS / customer-messages smoke", () => {
  test("POST /customer-messages bez sesji → 401", async ({ request }) => {
    const res = await request.post(
      `/api/panel/services/${FAKE_SVC}/customer-messages`,
      {
        data: { channel: "sms", body: "kod wydania: 123456" },
      },
    );
    expect(res.status()).toBe(401);
  });

  test("POST /release/resend bez sesji → 401", async ({ request }) => {
    const res = await request.post(
      `/api/panel/services/${FAKE_SVC}/release/resend`,
      { data: { channel: "sms" } },
    );
    expect(res.status()).toBe(401);
  });

  test("POST /release bez sesji → 401", async ({ request }) => {
    const res = await request.post(`/api/panel/services/${FAKE_SVC}/release`, {
      data: { code: "123456" },
    });
    expect(res.status()).toBe(401);
  });
});

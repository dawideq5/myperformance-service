/**
 * Wave 22 / F13 — testy `sendCustomerSms`.
 *
 * Mokujemy `fetch` żeby zweryfikować że:
 *   1. Bez `CHATWOOT_SMS_INBOX_ID` zwraca `error: "no_inbox"`.
 *   2. Bez phone zwraca `error: "no_phone"`.
 *   3. Happy path: szuka contact, znajduje conv w SMS inboxie, posta msg.
 *   4. New contact + new conversation gdy brak istniejącej w SMS inboxie.
 *   5. Error tag `conversation_failed` przy 422 z Chatwoota.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "CHATWOOT_URL",
  "CHATWOOT_PLATFORM_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "CHATWOOT_SMS_INBOX_ID",
  "CHATWOOT_SERVICE_INBOX_ID",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.CHATWOOT_URL = "https://chat.test.local";
  process.env.CHATWOOT_PLATFORM_TOKEN = "test-token";
  process.env.CHATWOOT_ACCOUNT_ID = "1";
  process.env.CHATWOOT_SMS_INBOX_ID = "6";
  delete process.env.CHATWOOT_SERVICE_INBOX_ID;
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

describe("sendCustomerSms", () => {
  it("returns no_inbox when CHATWOOT_SMS_INBOX_ID is unset", async () => {
    delete process.env.CHATWOOT_SMS_INBOX_ID;
    vi.resetModules();
    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "+48600000000",
      customerName: "Jan Kowalski",
      body: "test",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_inbox");
    expect(r.inboxId).toBeNull();
  });

  it("returns no_phone when phone is empty", async () => {
    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "",
      customerName: "Jan Kowalski",
      body: "test",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_phone");
    expect(r.inboxId).toBe(6);
  });

  it("posts message to existing SMS-inbox conversation when one exists", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/contacts/search")) {
          return jsonResponse(200, { payload: [{ id: 42 }] });
        }
        if (url.includes("/contacts/42/conversations")) {
          return jsonResponse(200, {
            payload: [
              { id: 100, inbox_id: 99, status: "open" }, // wrong inbox
              { id: 200, inbox_id: 6, status: "open" }, // SMS inbox
            ],
          });
        }
        if (url.includes("/conversations/200/messages")) {
          return jsonResponse(200, { id: 9001 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "+48600000000",
      customerName: "Jan Kowalski",
      body: "F13 test",
      ticketNumber: "SVC-2026-05-0001",
      serviceId: "svc-1",
    });
    expect(r.ok).toBe(true);
    expect(r.conversationId).toBe(200);
    expect(r.messageId).toBe(9001);
    expect(r.contactId).toBe(42);
    expect(r.inboxId).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates new SMS conversation when none exists for contact", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/contacts/search")) {
          return jsonResponse(200, { payload: [{ id: 42 }] });
        }
        if (url.includes("/contacts/42/conversations")) {
          return jsonResponse(200, { payload: [] }); // no SMS conv yet
        }
        if (url.match(/\/accounts\/\d+\/conversations$/)) {
          return jsonResponse(200, { id: 555 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "+48600000000",
      customerName: "Jan Kowalski",
      body: "F13 new conv",
      ticketNumber: "SVC-2026-05-0002",
      serviceId: "svc-2",
    });
    expect(r.ok).toBe(true);
    expect(r.conversationId).toBe(555);
    // Pierwszy message poszedł w body POST /conversations — messageId = null.
    expect(r.messageId).toBeNull();
    expect(r.inboxId).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("creates contact when search returns empty, then creates conversation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/contacts/search")) {
        return jsonResponse(200, { payload: [] });
      }
      if (url.match(/\/accounts\/\d+\/contacts$/)) {
        return jsonResponse(200, { payload: { contact: { id: 77 } } });
      }
      if (url.includes("/contacts/77/conversations")) {
        return jsonResponse(200, { payload: [] });
      }
      if (url.match(/\/accounts\/\d+\/conversations$/)) {
        return jsonResponse(200, { id: 888 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "+48600000000",
      customerName: "Jan Kowalski",
      body: "F13 brand new contact",
    });
    expect(r.ok).toBe(true);
    expect(r.contactId).toBe(77);
    expect(r.conversationId).toBe(888);
  });

  it("returns conversation_failed when Chatwoot rejects POST /conversations", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/contacts/search")) {
        return jsonResponse(200, { payload: [{ id: 42 }] });
      }
      if (url.includes("/contacts/42/conversations")) {
        return jsonResponse(200, { payload: [] });
      }
      if (url.match(/\/accounts\/\d+\/conversations$/)) {
        return jsonResponse(422, { message: "phone invalid" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { sendCustomerSms } = await import("@/lib/chatwoot-customer");
    const r = await sendCustomerSms({
      phone: "+48600000000",
      customerName: "Jan Kowalski",
      body: "boom",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("conversation_failed");
    expect(r.status).toBe(422);
    expect(r.detail).toContain("phone invalid");
  });
});

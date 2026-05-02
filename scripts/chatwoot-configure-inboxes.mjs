#!/usr/bin/env node
/**
 * Idempotent configuration helper for Chatwoot inboxes used by the service
 * panel (Wave 19 Faza 1C).
 *
 * What it does (per inbox match):
 *   1) Lists every inbox on the configured account.
 *   2) Matches against MATCHERS (case-insensitive substring on inbox name).
 *   3) PATCH /api/v1/accounts/{accountId}/inboxes/{id} setting:
 *        - webhook_url  (so Chatwoot pings dashboard /api/webhooks/chatwoot)
 *        - greeting_enabled + greeting_message       (web widget only)
 *        - pre_chat_form_enabled + pre_chat_form_options  (web widget only)
 *   4) Ensures an Account-level webhook exists pointing to the same URL
 *      (Chatwoot supports two webhook layers — inbox-level webhook_url +
 *      account-level subscriptions; we want both so neither path is missed).
 *
 * Re-runnable. Safe to invoke from CI/manual on VPS.
 *
 * ENV required:
 *   CHATWOOT_URL             https://chat.myperformance.pl
 *   CHATWOOT_PLATFORM_TOKEN  Platform token (admin)
 *   CHATWOOT_ACCOUNT_ID      e.g. 1
 *   CHATWOOT_WEBHOOK_URL     https://myperformance.pl/api/webhooks/chatwoot
 *   CHATWOOT_WEBHOOK_SECRET  shared secret (used as ?token=... query param;
 *                            HMAC fallback for inbox-level webhooks)
 *
 * Optional ENV:
 *   DRY_RUN=1   — only print planned changes, no PATCH
 */

import process from "node:process";

const required = (name) => {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[chatwoot-config] missing env: ${name}`);
    process.exit(2);
  }
  return v;
};

const CHATWOOT_URL = required("CHATWOOT_URL").replace(/\/$/, "");
const CHATWOOT_PLATFORM_TOKEN = required("CHATWOOT_PLATFORM_TOKEN");
const CHATWOOT_ACCOUNT_ID = required("CHATWOOT_ACCOUNT_ID");
const CHATWOOT_WEBHOOK_URL = required("CHATWOOT_WEBHOOK_URL").replace(/\/$/, "");
const CHATWOOT_WEBHOOK_SECRET = required("CHATWOOT_WEBHOOK_SECRET");
const DRY_RUN = process.env.DRY_RUN === "1";

// Account webhooks are unsigned — we bind the secret as a URL query param,
// the dashboard validates via timing-safe compare. Inbox webhooks support
// HMAC X-Chatwoot-Signature so we use the bare URL there.
const accountWebhookUrl = `${CHATWOOT_WEBHOOK_URL}?token=${encodeURIComponent(CHATWOOT_WEBHOOK_SECRET)}`;
const inboxWebhookUrl = CHATWOOT_WEBHOOK_URL;

/**
 * Substring matchers (case-insensitive). The first matcher hit wins.
 * Add more entries here when new service-related inboxes are created.
 */
const MATCHERS = [
  {
    needle: "sms",
    label: "SMS",
    config: {
      webhook_url: inboxWebhookUrl,
      // Pre-chat form / greetings są niedostępne dla SMS (Twilio / OVH).
      // Tylko webhook_url ma sens.
    },
  },
  {
    needle: "serwis telefon",
    label: "Serwis telefonów by Caseownia",
    config: {
      webhook_url: inboxWebhookUrl,
      greeting_enabled: true,
      greeting_message:
        "Witamy w Serwisie telefonów by Caseownia. " +
        "W czym pomóc? Jeśli pytanie dotyczy zlecenia, podaj jego numer w formacie #SVC-RRRR-MM-XXXX, " +
        "abyśmy mogli od razu sprawdzić status.",
      pre_chat_form_enabled: true,
      pre_chat_form_options: {
        pre_chat_message:
          "Aby przyspieszyć obsługę, prosimy o podanie kontaktu (e-mail i telefon) " +
          "oraz numeru zlecenia, jeśli już je posiadasz.",
        pre_chat_fields: [
          {
            field_type: "standard",
            label: "Imię i nazwisko",
            placeholder: "Jan Kowalski",
            name: "fullName",
            type: "text",
            required: true,
            enabled: true,
          },
          {
            field_type: "standard",
            label: "E-mail",
            placeholder: "jan@example.com",
            name: "emailAddress",
            type: "email",
            required: true,
            enabled: true,
          },
          {
            field_type: "standard",
            label: "Numer telefonu",
            placeholder: "+48 600 000 000",
            name: "phoneNumber",
            type: "text",
            required: true,
            enabled: true,
          },
          {
            field_type: "custom_attribute",
            label: "Numer zlecenia (opcjonalnie)",
            placeholder: "SVC-2026-05-0001",
            name: "ticket_number",
            type: "text",
            required: false,
            enabled: true,
          },
        ],
      },
    },
  },
];

async function cw(path, init = {}) {
  const url = `${CHATWOOT_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      api_access_token: CHATWOOT_PLATFORM_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    const detail = json ? JSON.stringify(json) : text;
    throw new Error(`HTTP ${res.status} ${path} → ${detail.slice(0, 400)}`);
  }
  return json;
}

async function listInboxes() {
  const r = await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`);
  // Chatwoot v3 returns {payload:[...]} for most list endpoints,
  // but `/inboxes` also returns {data:{payload:[...]}} on some versions.
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.payload)) return r.payload;
  if (Array.isArray(r?.data?.payload)) return r.data.payload;
  throw new Error("Unexpected /inboxes shape");
}

async function patchInbox(id, body) {
  if (DRY_RUN) {
    console.log(`[dry-run] PATCH /api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${id}`);
    console.log(`  body=${JSON.stringify(body)}`);
    return;
  }
  await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function listAccountWebhooks() {
  const r = await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks`);
  if (Array.isArray(r?.payload)) return r.payload;
  if (Array.isArray(r)) return r;
  return [];
}

async function ensureAccountWebhook() {
  const existing = await listAccountWebhooks();
  const match = existing.find(
    (w) =>
      typeof w?.url === "string" &&
      w.url.split("?")[0] === inboxWebhookUrl,
  );
  const subscriptions = [
    "conversation_created",
    "conversation_updated",
    "conversation_status_changed",
    "message_created",
  ];
  if (match) {
    if (DRY_RUN) {
      console.log(`[dry-run] account webhook already present id=${match.id}`);
      return;
    }
    await cw(
      `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks/${match.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          url: accountWebhookUrl,
          subscriptions,
        }),
      },
    );
    console.log(`account webhook updated id=${match.id}`);
    return;
  }
  if (DRY_RUN) {
    console.log(`[dry-run] would CREATE account webhook → ${accountWebhookUrl}`);
    return;
  }
  await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/webhooks`, {
    method: "POST",
    body: JSON.stringify({
      url: accountWebhookUrl,
      subscriptions,
    }),
  });
  console.log(`account webhook created → ${accountWebhookUrl.replace(/token=[^&]+/, "token=***")}`);
}

function findMatcher(inboxName) {
  const haystack = String(inboxName || "").toLowerCase();
  return MATCHERS.find((m) => haystack.includes(m.needle));
}

async function main() {
  console.log(
    `[chatwoot-config] base=${CHATWOOT_URL} account=${CHATWOOT_ACCOUNT_ID} webhook=${CHATWOOT_WEBHOOK_URL} dry=${DRY_RUN}`,
  );
  const inboxes = await listInboxes();
  console.log(`[chatwoot-config] found ${inboxes.length} inboxes`);
  for (const ib of inboxes) {
    const id = ib?.id;
    const name = ib?.name ?? "(unnamed)";
    const channel = ib?.channel_type ?? ib?.channel?.name ?? "(unknown)";
    const matcher = findMatcher(name);
    const status = matcher ? `MATCH=${matcher.label}` : "skip";
    console.log(`  - id=${id} name="${name}" channel=${channel} → ${status}`);
    if (matcher && id != null) {
      try {
        await patchInbox(id, matcher.config);
        console.log(`    ok PATCHed ${matcher.label}`);
      } catch (err) {
        console.error(`    FAIL ${matcher.label}: ${String(err)}`);
      }
    }
  }

  console.log(`[chatwoot-config] ensuring account webhook…`);
  try {
    await ensureAccountWebhook();
  } catch (err) {
    console.error(`[chatwoot-config] account webhook failed: ${String(err)}`);
  }

  console.log(`[chatwoot-config] done`);
}

main().catch((err) => {
  console.error(`[chatwoot-config] fatal: ${String(err)}`);
  process.exit(1);
});

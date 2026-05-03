#!/usr/bin/env node
/**
 * Chatwoot Dashboard App configurator (Wave 24).
 *
 * Tworzy / aktualizuje "Aplikację na pulpicie" o nazwie `Intake live preview`,
 * widoczną w sidebarze konwersacji w inboxie `Przyjęcie serwisowe`.
 *
 * Dashboard App URL:
 *   https://myperformance.pl/chatwoot-app/intake-preview
 *     ?conversation_id={{conversation.id}}
 *     &service_id={{conversation.custom_attributes.service_id}}
 *
 *   - `conversation.id` jest zawsze obecne — daje canonical klucz dla
 *     conversation-snapshot, który serwuje draft state z mp_intake_drafts
 *     ZANIM sprzedawca zapisze ticket.
 *   - `conversation.custom_attributes.service_id` jest opcjonalne — gdy ticket
 *     już istnieje, frontend bierze live snapshot z mp_services i markuje go
 *     jako canonical zamiast draftu.
 *
 * Chatwoot API:
 *   GET    /api/v1/accounts/{accountId}/dashboard_apps         — list
 *   POST   /api/v1/accounts/{accountId}/dashboard_apps         — create
 *   PATCH  /api/v1/accounts/{accountId}/dashboard_apps/{id}    — update
 *   DELETE /api/v1/accounts/{accountId}/dashboard_apps/{id}    — remove
 *
 *   Dashboard App `content` = array of objects `{ type: "frame", url: "..." }`.
 *   Wave 24 używa pojedynczego frame'a (Chatwoot UI pokaże go jako tab w
 *   conversation sidebar).
 *
 * Per-inbox visibility:
 *   Dashboard Apps są ACCOUNT-LEVEL (widoczne we wszystkich inboxach).
 *   Filtrowanie per-inbox robi się client-side w Chatwoot UI przez
 *   feature flag, ale w API to globalne. Tu rejestrujemy aplikację dla
 *   konta — odpowiednie kontrole widoczności są w Chatwoot interface.
 *
 * ENV:
 *   CHATWOOT_URL              https://chat.myperformance.pl
 *   CHATWOOT_PLATFORM_TOKEN   Platform token (admin)
 *   CHATWOOT_ACCOUNT_ID       np. 1
 *   APP_BASE_URL?             default https://myperformance.pl
 *   DASHBOARD_APP_TITLE?      default "Widok przyjęcia serwisowego"
 *   INBOX_NAME?               default "Przyjęcie serwisowe" (do logu informacyjnego)
 *
 * Optional:
 *   DRY_RUN=1     log planned changes, no PATCH/POST
 */

import process from "node:process";

const required = (name) => {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[chatwoot-dashboard-app] missing env: ${name}`);
    process.exit(2);
  }
  return v;
};

const CHATWOOT_URL = required("CHATWOOT_URL").replace(/\/$/, "");
const CHATWOOT_PLATFORM_TOKEN = required("CHATWOOT_PLATFORM_TOKEN");
const CHATWOOT_ACCOUNT_ID = required("CHATWOOT_ACCOUNT_ID");
const APP_BASE_URL = (process.env.APP_BASE_URL?.trim() || "https://myperformance.pl").replace(
  /\/$/,
  "",
);
const DASHBOARD_APP_TITLE =
  process.env.DASHBOARD_APP_TITLE?.trim() || "Widok przyjęcia serwisowego";
const INBOX_NAME = process.env.INBOX_NAME?.trim() || "Przyjęcie serwisowe";
const DRY_RUN = process.env.DRY_RUN === "1";

/**
 * Statyczny URL — Chatwoot Dashboard Apps NIE robią template substitution
 * w URL (Frame.vue ładuje iframe.src dosłownie). Kontekst (conversation,
 * contact, currentAgent) jest przekazywany przez `postMessage({event:
 * "appContext", data:...})` z parent window do iframe po @load. Frontend
 * (IntakePreviewClient) ma listener `window.message`.
 */
const FRAME_URL = `${APP_BASE_URL}/chatwoot-app/intake-preview`;

const PAYLOAD = {
  title: DASHBOARD_APP_TITLE,
  content: [{ type: "frame", url: FRAME_URL }],
};

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

async function listDashboardApps() {
  const r = await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/dashboard_apps`);
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.payload)) return r.payload;
  if (Array.isArray(r?.data)) return r.data;
  if (Array.isArray(r?.data?.payload)) return r.data.payload;
  return [];
}

async function listInboxes() {
  const r = await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/inboxes`);
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.payload)) return r.payload;
  if (Array.isArray(r?.data?.payload)) return r.data.payload;
  return [];
}

async function upsertDashboardApp() {
  const apps = await listDashboardApps();
  const match = apps.find(
    (a) =>
      typeof a?.title === "string" &&
      a.title.trim().toLowerCase() === DASHBOARD_APP_TITLE.toLowerCase(),
  );

  if (match) {
    if (DRY_RUN) {
      console.log(
        `[dry-run] PATCH dashboard_app id=${match.id} title="${DASHBOARD_APP_TITLE}"`,
      );
      console.log(`  body=${JSON.stringify(PAYLOAD)}`);
      return match.id;
    }
    await cw(`/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/dashboard_apps/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify(PAYLOAD),
    });
    console.log(`updated dashboard_app id=${match.id}`);
    return match.id;
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] POST dashboard_app title="${DASHBOARD_APP_TITLE}" url=${FRAME_URL}`,
    );
    return null;
  }
  const created = await cw(
    `/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/dashboard_apps`,
    {
      method: "POST",
      body: JSON.stringify(PAYLOAD),
    },
  );
  const newId = created?.id ?? created?.data?.id;
  console.log(`created dashboard_app id=${newId} url=${FRAME_URL}`);
  return newId ?? null;
}

async function main() {
  console.log(
    `[chatwoot-dashboard-app] base=${CHATWOOT_URL} account=${CHATWOOT_ACCOUNT_ID} title="${DASHBOARD_APP_TITLE}" dry=${DRY_RUN}`,
  );

  // Diagnostyczne sprawdzenie inboxa (opcjonalne — Dashboard Apps są
  // account-level, ale chcemy potwierdzić sprzedawcy że inbox istnieje).
  try {
    const inboxes = await listInboxes();
    const inbox = inboxes.find(
      (ib) =>
        typeof ib?.name === "string" &&
        ib.name.toLowerCase().includes(INBOX_NAME.toLowerCase()),
    );
    if (inbox) {
      console.log(
        `inbox match: "${inbox.name}" id=${inbox.id} channel=${
          inbox.channel_type ?? inbox.channel?.name ?? "?"
        }`,
      );
    } else {
      console.warn(
        `WARN: inbox o nazwie zawierającej "${INBOX_NAME}" nie znaleziony — Dashboard App i tak będzie widoczny we wszystkich inboxach (account-level).`,
      );
    }
  } catch (err) {
    console.warn(`WARN: nie udało się pobrać listy inboxów: ${String(err)}`);
  }

  const id = await upsertDashboardApp();
  if (id) {
    console.log(
      `done — Dashboard App "${DASHBOARD_APP_TITLE}" jest aktywny w Chatwoot (id=${id}).`,
    );
    console.log(
      `Sprawdź sidebar conversation w inboxie "${INBOX_NAME}" — powinien pokazać tab "${DASHBOARD_APP_TITLE}".`,
    );
  }
}

main().catch((err) => {
  console.error(`[chatwoot-dashboard-app] fatal: ${String(err)}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Idempotentny seed ról realm wynikających z AREAS registry.
 *
 * Tworzy brakujące role, aktualizuje description na podstawie seeda.
 * NIGDY nie usuwa ról (usuwaniem custom roles zajmuje się panel).
 *
 * Usage:
 *   KEYCLOAK_URL=https://auth.myperformance.pl \
 *   KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_CLIENT_ID=admin-cli \
 *   KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *     node scripts/seed-area-roles.mjs
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || REALM;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[seed-area-roles] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

// Lista skopiowana z lib/permissions/areas.ts — skrypt jest pure Node bez
// resolvowania TS. Zmiany w AREAS wymagają aktualizacji tu.
const AREA_ROLES = [
  { name: "chatwoot_user", description: "Chatwoot: agent obsługi klienta (zwykły dostęp)." },
  { name: "chatwoot_admin", description: "Chatwoot: administrator (konfiguracja, webhooki)." },
  { name: "moodle_user", description: "Moodle: dostęp do kursów i szkoleń." },
  { name: "moodle_admin", description: "Moodle: manager (konfiguracja, pluginy, użytkownicy)." },
  { name: "directus_user", description: "Directus: zwykły dostęp do CMS." },
  { name: "directus_admin", description: "Directus: administrator." },
  { name: "documenso_user", description: "Documenso: pracownik — podpisuje własne dokumenty." },
  { name: "documenso_admin", description: "Documenso: administrator (szablony, webhooki, użytkownicy)." },
  { name: "knowledge_user", description: "Outline: czytanie/edycja wiki." },
  { name: "knowledge_admin", description: "Outline: administrator (grupy, collections, integracje)." },
  { name: "postal_user", description: "Postal: dostęp do przypisanych serwerów." },
  { name: "postal_admin", description: "Postal: administrator (serwery, domeny, polityki)." },
  { name: "certificates_admin", description: "Wydawanie i odwoływanie certyfikatów klienckich." },
  { name: "stepca_admin", description: "Administrator step-ca (provisionery, polityki)." },
  { name: "keycloak_admin", description: "Administrator Keycloak (klienci, realm settings)." },
  { name: "kadromierz_user", description: "Dostęp do grafiku Kadromierz." },
  { name: "sprzedawca", description: "Dostęp do panelu sprzedawcy." },
  { name: "serwisant", description: "Dostęp do panelu serwisanta." },
  { name: "kierowca", description: "Dostęp do panelu kierowcy." },
  { name: "app_user", description: "Dostęp do dashboardu (domyślna dla każdego zalogowanego)." },
];

async function getAccessToken() {
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const user = process.env.KEYCLOAK_ADMIN_USER;
  const pass = process.env.KEYCLOAK_ADMIN_PASSWORD;

  const body = new URLSearchParams();
  if (clientId && clientSecret) {
    body.set("grant_type", "client_credentials");
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  } else if (user && pass) {
    body.set("grant_type", "password");
    body.set("client_id", "admin-cli");
    body.set("username", user);
    body.set("password", pass);
  } else {
    console.error(
      "[seed-area-roles] Ustaw KEYCLOAK_ADMIN_CLIENT_ID+SECRET lub KEYCLOAK_ADMIN_USER+PASSWORD",
    );
    process.exit(2);
  }

  const res = await fetch(
    `${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function kcFetch(token, path, init = {}) {
  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function ensureRole(token, role) {
  const get = await kcFetch(token, `/roles/${encodeURIComponent(role.name)}`);
  if (get.ok) {
    const existing = await get.json();
    if (existing.description !== role.description) {
      const upd = await kcFetch(token, `/roles-by-id/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...existing, description: role.description }),
      });
      if (!upd.ok) {
        const body = await upd.text().catch(() => "");
        throw new Error(`update role ${role.name}: ${upd.status} ${body}`);
      }
      console.log(`[seed-area-roles] updated description: ${role.name}`);
    } else {
      console.log(`[seed-area-roles] ok: ${role.name}`);
    }
    return;
  }
  if (get.status !== 404) {
    const body = await get.text().catch(() => "");
    throw new Error(`probe role ${role.name}: ${get.status} ${body}`);
  }
  const create = await kcFetch(token, "/roles", {
    method: "POST",
    body: JSON.stringify({ name: role.name, description: role.description }),
  });
  if (!create.ok && create.status !== 409) {
    const body = await create.text().catch(() => "");
    throw new Error(`create role ${role.name}: ${create.status} ${body}`);
  }
  console.log(`[seed-area-roles] created: ${role.name}`);
}

async function main() {
  console.log(`[seed-area-roles] realm=${REALM} at ${KEYCLOAK_URL}`);
  const token = await getAccessToken();
  for (const r of AREA_ROLES) {
    await ensureRole(token, r);
  }
  console.log(`[seed-area-roles] done — ${AREA_ROLES.length} role sprawdzone`);
}

main().catch((err) => {
  console.error("[seed-area-roles] FAILED:", err);
  process.exit(1);
});

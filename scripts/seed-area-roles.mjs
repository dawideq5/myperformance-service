#!/usr/bin/env node
/**
 * Idempotentny seed ról realm wynikających z AREAS registry.
 *
 * Tworzy brakujące role, aktualizuje description/attrs z seeda. Nie
 * usuwa ról — usuwanie legacy robi `scripts/migrate-roles-2026-04.mjs`.
 *
 * Dla aplikacji z dynamicznymi rolami (Moodle) seeduje tylko rolę
 * baseline — pełna lista jest hydrowana przez `kc-sync` przy starcie
 * serwera Next (lub przez `POST /api/admin/iam/sync-kc`).
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

// Lista pokrywa seedy z lib/permissions/areas.ts. Dynamic roles (Moodle)
// są dociągane przez kc-sync przy starcie serwera.
const AREA_ROLES = [
  { name: "chatwoot_agent", areaId: "chatwoot", label: "Agent", description: "Chatwoot: agent obsługi klienta." },
  { name: "chatwoot_admin", areaId: "chatwoot", label: "Administrator", description: "Chatwoot: administrator (konfiguracja, webhooki, integracje)." },

  { name: "moodle_student", areaId: "moodle", label: "Student", description: "Moodle: dostęp do kursów." },
  { name: "moodle_manager", areaId: "moodle", label: "Menedżer", description: "Moodle: menedżer instancji." },

  { name: "directus_admin", areaId: "directus", label: "Administrator", description: "Directus: administrator." },

  { name: "documenso_member", areaId: "documenso", label: "Użytkownik", description: "Documenso: pracownik — własne dokumenty." },
  { name: "documenso_manager", areaId: "documenso", label: "Menedżer", description: "Documenso: menedżer zespołu." },
  { name: "documenso_admin", areaId: "documenso", label: "Administrator", description: "Documenso: administrator." },

  { name: "knowledge_viewer", areaId: "knowledge", label: "Widz", description: "Outline: tylko odczyt." },
  { name: "knowledge_editor", areaId: "knowledge", label: "Edytor", description: "Outline: tworzenie i edycja dokumentów." },
  { name: "knowledge_admin", areaId: "knowledge", label: "Administrator", description: "Outline: administrator." },

  { name: "postal_admin", areaId: "postal", label: "Administrator", description: "Postal: administrator (serwery, domeny, polityki)." },

  { name: "certificates_admin", areaId: "certificates", label: "Administrator", description: "Wydawanie i odwoływanie certyfikatów klienckich." },
  { name: "stepca_admin", areaId: "stepca", label: "Administrator", description: "Administrator step-ca (provisionery, polityki)." },
  { name: "keycloak_admin", areaId: "keycloak", label: "Administrator", description: "Administrator Keycloak (klienci, realm settings)." },
  { name: "kadromierz_user", areaId: "kadromierz", label: "Użytkownik", description: "Dostęp do grafiku Kadromierz." },

  { name: "sprzedawca", areaId: "panel-sprzedawca", label: "Użytkownik", description: "Dostęp do panelu sprzedawcy." },
  { name: "serwisant", areaId: "panel-serwisant", label: "Użytkownik", description: "Dostęp do panelu serwisanta." },
  { name: "kierowca", areaId: "panel-kierowca", label: "Użytkownik", description: "Dostęp do panelu kierowcy." },

  { name: "app_user", areaId: "core", label: "Użytkownik", description: "Dostęp do dashboardu (domyślna)." },
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
  const attrs = {
    areaId: [role.areaId],
    label: [role.label],
    seed: ["true"],
  };
  const get = await kcFetch(token, `/roles/${encodeURIComponent(role.name)}`);
  if (get.ok) {
    const existing = await get.json();
    const full = await kcFetch(
      token,
      `/roles-by-id/${existing.id}?briefRepresentation=false`,
    );
    const existingFull = full.ok ? await full.json() : existing;
    const needsUpdate =
      existingFull.description !== role.description ||
      JSON.stringify(existingFull.attributes || {}) !==
        JSON.stringify({ ...(existingFull.attributes || {}), ...attrs });
    if (needsUpdate) {
      const upd = await kcFetch(token, `/roles-by-id/${existingFull.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...existingFull,
          description: role.description,
          attributes: { ...(existingFull.attributes || {}), ...attrs },
        }),
      });
      if (!upd.ok) {
        const body = await upd.text().catch(() => "");
        throw new Error(`update role ${role.name}: ${upd.status} ${body}`);
      }
      console.log(`[seed-area-roles] updated: ${role.name}`);
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
    body: JSON.stringify({
      name: role.name,
      description: role.description,
      attributes: attrs,
    }),
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
  console.log(`[seed-area-roles] done — ${AREA_ROLES.length} ról sprawdzonych`);
}

main().catch((err) => {
  console.error("[seed-area-roles] FAILED:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Idempotent Keycloak seeder for the MyPerformance realm.
 *
 * Creates / updates:
 *  1. All 15 OIDC clients (one per service area).
 *  2. All realm roles from lib/admin-auth.ts (ROLE_CATALOG) + legacy
 *     panel roles (sprzedawca, serwisant, kierowca) and their admin twins.
 *  3. `default-roles-myperformance` composite — every user auto-gets
 *     app_user, kadromierz_user.
 *
 * Usage:
 *   KEYCLOAK_URL=https://auth.myperformance.pl \
 *   KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_USER=admin \
 *   KEYCLOAK_ADMIN_PASSWORD=... \
 *     node scripts/keycloak-seed.mjs
 *
 * Alternative auth (service account in the master realm):
 *   KEYCLOAK_URL=... \
 *   KEYCLOAK_ADMIN_CLIENT_ID=admin-cli \
 *   KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *     node scripts/keycloak-seed.mjs
 *
 * Safe to re-run. Existing clients/roles are updated, never deleted.
 * Client secrets are printed once at the end — persist them in Coolify envs
 * immediately (they are shown only the first time a client is created).
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const DASHBOARD_BASE = process.env.DASHBOARD_BASE_URL || "https://myperformance.pl";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[keycloak-seed] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Role catalog — mirrors lib/admin-auth.ts ROLE_CATALOG. Kept duplicated here
// because this script is pure Node (no TS import), and the list is stable.
// ---------------------------------------------------------------------------
const ROLES = [
  // defaults (auto-granted)
  { name: "app_user",            description: "Dostęp do dashboardu",                                 default: true  },
  { name: "kadromierz_user",     description: "Kadromierz (grafik, ewidencja czasu)",                  default: true  },

  // gated
  { name: "manage_users",        description: "/admin/users — zarządzanie kontami",                    default: false },
  { name: "certificates_admin",  description: "Wystawianie i odwoływanie certyfikatów klienckich",     default: false },

  { name: "directus_admin",      description: "Administrator Directus CMS",                            default: false },

  { name: "documenso_user",      description: "Documenso: pracownik (własne dokumenty)",               default: false },
  { name: "documenso_handler",   description: "Documenso: obsługa dokumentów (księgowa, obieg org)",   default: false },
  { name: "documenso_admin",     description: "Documenso: administrator",                              default: false },

  { name: "chatwoot_agent",      description: "Agent obsługi klienta w Chatwoot",                      default: false },
  { name: "chatwoot_admin",      description: "Administrator Chatwoot",                                default: false },

  { name: "postal_admin",        description: "Administrator platformy e-mail (Postal)",                default: false },

  { name: "keycloak_admin",      description: "Konsola administracyjna Keycloak",                       default: false },

  { name: "stepca_admin",        description: "Administrator step-ca (provisionery, polityki, self-service)", default: false },

  { name: "moodle_student",      description: "Moodle: uczeń (kursy przypisane do konta)",            default: false },
  { name: "moodle_teacher",      description: "Moodle: nauczyciel (kursy, ocenianie, raporty)",       default: false },
  { name: "moodle_admin",        description: "Moodle: administrator instancji (konfig, pluginy)",    default: false },

  { name: "knowledge_user",      description: "Baza wiedzy (Outline): czytanie i edycja artykułów",   default: true  },
  { name: "knowledge_admin",     description: "Baza wiedzy (Outline): administrator",                 default: false },

  // panel realm-roles — used by both the mTLS panels and dashboard gating
  { name: "sprzedawca",          description: "Dostęp do panelu sprzedawcy",                           default: false },
  { name: "sprzedawca_admin",    description: "Administrator panelu sprzedawcy",                       default: false },
  { name: "serwisant",           description: "Dostęp do panelu serwisanta",                           default: false },
  { name: "serwisant_admin",     description: "Administrator panelu serwisanta",                       default: false },
  { name: "kierowca",            description: "Dostęp do panelu kierowcy",                             default: false },
  { name: "kierowca_admin",      description: "Administrator panelu kierowcy",                         default: false },
];

// ---------------------------------------------------------------------------
// Clients — 15 logical "services" the user enumerated. Each entry becomes
// a Keycloak OIDC client. Dashboard/panels already have existing clients
// that we just ensure-exist. Services without a web UI that needs OIDC (like
// Kalendarz, Kadromierz, Moje dokumenty, Certyfikaty, Użytkownicy,
// Zarządzanie kontem) are registered as public "bearer-only" clients or
// aren't given redirect URIs — they exist for RBAC/documentation purposes.
// ---------------------------------------------------------------------------
const CLIENTS = [
  // Already-existing clients — ensure updated
  {
    clientId: "myperformance-dashboard", name: "MyPerformance Dashboard",
    publicClient: false, standardFlow: true,
    rootUrl: DASHBOARD_BASE, redirectUris: [`${DASHBOARD_BASE}/*`], webOrigins: ["+"],
    serviceAccountsEnabled: false,
    description: "Główny dashboard (Next.js)",
  },
  {
    clientId: "myperformance-service", name: "MyPerformance Service Account",
    publicClient: false, standardFlow: false,
    serviceAccountsEnabled: true,
    description: "Service account dla dashboardu — Admin API, magic-link bridge",
  },
  {
    clientId: "panel-sprzedawca", name: "Panel Sprzedawcy",
    publicClient: false, standardFlow: true,
    rootUrl: "https://panelsprzedawcy.myperformance.pl",
    redirectUris: ["https://panelsprzedawcy.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Panel sprzedawcy — mTLS + SSO",
  },
  {
    clientId: "panel-serwisant", name: "Panel Serwisanta",
    publicClient: false, standardFlow: true,
    rootUrl: "https://panelserwisanta.myperformance.pl",
    redirectUris: ["https://panelserwisanta.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Panel serwisanta — mTLS + SSO",
  },
  {
    clientId: "panel-kierowca", name: "Panel Kierowcy",
    publicClient: false, standardFlow: true,
    rootUrl: "https://panelkierowcy.myperformance.pl",
    redirectUris: ["https://panelkierowcy.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Panel kierowcy — mTLS + SSO",
  },
  {
    clientId: "documenso", name: "Documenso",
    publicClient: false, standardFlow: true,
    rootUrl: "https://sign.myperformance.pl",
    redirectUris: ["https://sign.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Documenso — podpisy elektroniczne",
  },
  {
    clientId: "chatwoot", name: "Chatwoot",
    publicClient: false, standardFlow: true,
    rootUrl: "https://chat.myperformance.pl",
    redirectUris: ["https://chat.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Chatwoot — obsługa klienta",
  },
  {
    clientId: "directus", name: "Directus CMS",
    publicClient: false, standardFlow: true,
    rootUrl: "https://cms.myperformance.pl",
    redirectUris: ["https://cms.myperformance.pl/*"],
    webOrigins: ["+"],
    description: "Directus — CMS / dane aplikacji",
  },

  // New clients to add
  {
    clientId: "postal", name: "Postal",
    publicClient: false, standardFlow: true,
    rootUrl: "https://postal.myperformance.pl",
    redirectUris: ["https://postal.myperformance.pl/auth/oidc/callback"],
    webOrigins: ["https://postal.myperformance.pl"],
    description: "Postal — serwer pocztowy (transakcyjne + newslettery); natywny OIDC /auth/oidc/callback",
  },
  {
    clientId: "stepca-oidc", name: "step-ca (OIDC provisioner)",
    publicClient: true, standardFlow: true,
    rootUrl: "https://ca.myperformance.pl",
    redirectUris: ["http://127.0.0.1/*", "http://localhost/*"],
    webOrigins: [],
    description: "Prowizjoner OIDC step-ca — samoobsługowe wydawanie certów dla użytkowników",
    attributes: { "pkce.code.challenge.method": "S256" },
  },
  {
    clientId: "moodle", name: "Moodle LMS",
    publicClient: false, standardFlow: true,
    rootUrl: "https://moodle.myperformance.pl",
    redirectUris: [
      "https://moodle.myperformance.pl/auth/oidc/",
      "https://moodle.myperformance.pl/auth/oidc/*",
    ],
    webOrigins: ["https://moodle.myperformance.pl"],
    description: "Moodle LMS — OIDC login via auth_oidc plugin; role→capability mapping set w Moodle admin",
  },
  {
    clientId: "outline", name: "Outline (baza wiedzy)",
    publicClient: false, standardFlow: true,
    rootUrl: "https://knowledge.myperformance.pl",
    redirectUris: [
      "https://knowledge.myperformance.pl/auth/oidc.callback",
      "https://knowledge.myperformance.pl/auth/oidc.callback*",
    ],
    webOrigins: ["https://knowledge.myperformance.pl"],
    description: "Outline wiki — natywne OIDC; claim preferred_username mapuje użytkownika",
  },

  // Virtual clients — no SSO login flow, exist for Directus clients seed + RBAC readability
  { clientId: "mp-calendar",    name: "Kalendarz",               description: "Kalendarz Google (usługa dashboardu)",           publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-certificates", name: "Certyfikaty klienckie",  description: "Wydawanie certyfikatów mTLS (usługa dashboardu)", publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-kadromierz",  name: "Kadromierz",              description: "Integracja Kadromierz (usługa dashboardu)",      publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-users",       name: "Użytkownicy",             description: "Zarządzanie użytkownikami (usługa dashboardu)",  publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-account",     name: "Zarządzanie kontem",      description: "Samoobsługa konta (usługa dashboardu)",          publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-keycloak",    name: "Keycloak",                description: "Konsola administracyjna Keycloak",               publicClient: true,  standardFlow: false, bearerOnly: true },
  { clientId: "mp-stepca",      name: "Step CA",                 description: "Infrastruktura PKI (step-ca)",                   publicClient: true,  standardFlow: false, bearerOnly: true },
];

// ---------------------------------------------------------------------------
// Keycloak Admin API helpers
// ---------------------------------------------------------------------------
async function getAdminToken() {
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  const user = process.env.KEYCLOAK_ADMIN_USER;
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD;

  // Admin token realm — domyślnie `master` (bootstrap admin user),
  // ale service-account z realm-management w docelowym realmie też zadziała
  // (ustaw KEYCLOAK_ADMIN_REALM=MyPerformance).
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM || "master";
  const url = `${KEYCLOAK_URL}/realms/${adminRealm}/protocol/openid-connect/token`;

  const params = new URLSearchParams();
  if (clientId && clientSecret) {
    params.set("grant_type", "client_credentials");
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  } else if (user && password) {
    params.set("grant_type", "password");
    params.set("client_id", "admin-cli");
    params.set("username", user);
    params.set("password", password);
  } else {
    console.error("[keycloak-seed] Provide KEYCLOAK_ADMIN_USER/PASSWORD or KEYCLOAK_ADMIN_CLIENT_ID/SECRET");
    process.exit(2);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin token failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function kc(path, token, init = {}) {
  const url = `${KEYCLOAK_URL}/admin/realms/${REALM}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${body}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Role ops
// ---------------------------------------------------------------------------
async function ensureRealmRole(token, { name, description }) {
  const get = await kc(`/roles/${encodeURIComponent(name)}`, token);
  if (get.ok) {
    const existing = await get.json();
    if (existing.description !== description) {
      await kc(`/roles/${encodeURIComponent(name)}`, token, {
        method: "PUT",
        body: JSON.stringify({ ...existing, description }),
      });
      console.log(`[role] updated ${name}`);
    }
    return "exists";
  }
  const create = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description }),
  });
  if (!create.ok) {
    throw new Error(`create role ${name} → ${create.status} ${await create.text()}`);
  }
  console.log(`[role] created ${name}`);
  return "created";
}

async function ensureDefaultComposites(token, defaultRoleNames) {
  // the default composite role is `default-roles-<realm>` (lowercase)
  const defaultRoleName = `default-roles-${REALM.toLowerCase()}`;
  const getRole = await kc(`/roles/${encodeURIComponent(defaultRoleName)}`, token);
  if (!getRole.ok) {
    console.warn(`[defaults] ${defaultRoleName} missing (Keycloak will create on first login)`);
    return;
  }

  const current = await kc(`/roles/${encodeURIComponent(defaultRoleName)}/composites/realm`, token);
  const currentRoles = current.ok ? await current.json() : [];
  const haveNames = new Set(currentRoles.map((r) => r.name));
  const toAdd = [];
  for (const name of defaultRoleNames) {
    if (haveNames.has(name)) continue;
    const r = await kc(`/roles/${encodeURIComponent(name)}`, token);
    if (!r.ok) continue;
    toAdd.push(await r.json());
  }
  if (toAdd.length === 0) {
    console.log(`[defaults] already contains: ${[...haveNames].join(", ")}`);
    return;
  }
  const add = await kc(
    `/roles/${encodeURIComponent(defaultRoleName)}/composites`,
    token,
    {
      method: "POST",
      body: JSON.stringify(toAdd.map((r) => ({ id: r.id, name: r.name, containerId: r.containerId }))),
    },
  );
  if (!add.ok) {
    throw new Error(`add defaults → ${add.status} ${await add.text()}`);
  }
  console.log(`[defaults] added ${toAdd.map((r) => r.name).join(", ")}`);
}

// ---------------------------------------------------------------------------
// Client ops
// ---------------------------------------------------------------------------
function buildClientPayload(c) {
  return {
    clientId: c.clientId,
    name: c.name,
    description: c.description,
    enabled: true,
    publicClient: c.publicClient ?? false,
    bearerOnly: c.bearerOnly ?? false,
    standardFlowEnabled: c.standardFlow ?? false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: c.serviceAccountsEnabled ?? false,
    rootUrl: c.rootUrl,
    baseUrl: c.rootUrl,
    redirectUris: c.redirectUris ?? [],
    webOrigins: c.webOrigins ?? [],
    protocol: "openid-connect",
    attributes: {
      "post.logout.redirect.uris": "+",
      ...(c.attributes || {}),
    },
  };
}

async function ensureClient(token, c) {
  const list = await kc(`/clients?clientId=${encodeURIComponent(c.clientId)}`, token);
  const existing = (await list.json()) || [];
  const payload = buildClientPayload(c);

  let id;
  let created = false;
  let secret = null;

  if (existing.length > 0) {
    id = existing[0].id;
    // Preserve existing secret by copying over — Keycloak discards secret
    // unless you set "secret" explicitly, and we don't want to rotate it.
    await kc(`/clients/${id}`, token, {
      method: "PUT",
      body: JSON.stringify({ ...existing[0], ...payload }),
    });
    console.log(`[client] updated ${c.clientId}`);
  } else {
    const create = await kc("/clients", token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!create.ok) {
      throw new Error(`create client ${c.clientId} → ${create.status} ${await create.text()}`);
    }
    const location = create.headers.get("location") || "";
    id = location.split("/").pop();
    created = true;
    if (!payload.publicClient && !payload.bearerOnly) {
      const sec = await kc(`/clients/${id}/client-secret`, token);
      if (sec.ok) secret = (await sec.json()).value;
    }
    console.log(`[client] created ${c.clientId}${secret ? " (secret captured)" : ""}`);
  }

  await ensureAudienceMappers(token, id, c);

  return { id, created, secret };
}

// oauth2-proxy and similar gateways require the client_id in token `aud`.
// Keycloak by default only populates aud with [account realm-management broker],
// so we explicitly create audience mappers for clients that need it.
async function ensureAudienceMappers(token, clientId, c) {
  const wanted = c.audienceMappers || [];
  if (wanted.length === 0) return;
  const listRes = await kc(`/clients/${clientId}/protocol-mappers/models`, token);
  const current = listRes.ok ? await listRes.json() : [];
  const existingAud = new Set(
    current
      .filter((m) => m.protocolMapper === "oidc-audience-mapper")
      .map((m) => m.config?.["included.client.audience"])
      .filter(Boolean),
  );
  for (const aud of wanted) {
    if (existingAud.has(aud)) continue;
    const create = await kc(`/clients/${clientId}/protocol-mappers/models`, token, {
      method: "POST",
      body: JSON.stringify({
        name: `aud-${aud}`,
        protocol: "openid-connect",
        protocolMapper: "oidc-audience-mapper",
        config: {
          "included.client.audience": aud,
          "included.custom.audience": "",
          "id.token.claim": "false",
          "access.token.claim": "true",
        },
      }),
    });
    if (!create.ok) {
      throw new Error(`audience mapper ${aud} → ${create.status} ${await create.text()}`);
    }
    console.log(`[client] ${c.clientId}: added audience mapper aud=${aud}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[keycloak-seed] realm=${REALM} url=${KEYCLOAK_URL}`);
  const token = await getAdminToken();

  // 1) roles
  for (const r of ROLES) {
    await ensureRealmRole(token, r);
  }

  // 2) default composites
  await ensureDefaultComposites(
    token,
    ROLES.filter((r) => r.default).map((r) => r.name),
  );

  // 3) clients
  const captured = [];
  for (const c of CLIENTS) {
    const res = await ensureClient(token, c);
    if (res.secret) {
      captured.push({ clientId: c.clientId, secret: res.secret });
    }
  }

  if (captured.length) {
    console.log("\n=== NEW CLIENT SECRETS (persist in Coolify immediately) ===");
    for (const c of captured) {
      console.log(`  ${c.clientId}: ${c.secret}`);
    }
  }
  console.log("\n[keycloak-seed] done");
}

main().catch((err) => {
  console.error("[keycloak-seed] FAILED:", err);
  process.exit(1);
});

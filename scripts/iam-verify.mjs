#!/usr/bin/env node
/**
 * Diagnostyczne sprawdzenie konfiguracji IAM — tylko odczyt. Uruchamiane
 * lokalnie lub z admin-hosta, nic nie modyfikuje.
 *
 * Weryfikuje:
 *   - Keycloak realm + role (knowledge_*, directus_admin, postal_*, itd.)
 *   - OIDC klientów (outline, directus, documenso, moodle, postal, stepca-oidc)
 *   - well-known/openid-configuration dla realmu
 *   - (opcjonalnie) Coolify envs dla każdej aplikacji, gdy COOLIFY_* podane
 *
 * Użycie:
 *   KEYCLOAK_URL=... KEYCLOAK_REALM=... \
 *     KEYCLOAK_SERVICE_CLIENT_ID=... KEYCLOAK_SERVICE_CLIENT_SECRET=... \
 *     [COOLIFY_BASE_URL=... COOLIFY_API_TOKEN=...] \
 *     [COOLIFY_DIRECTUS_UUID=... COOLIFY_OUTLINE_UUID=... ...] \
 *     node scripts/iam-verify.mjs
 */

import process from "node:process";

const required = (name) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
};

const KC_URL = required("KEYCLOAK_URL").replace(/\/$/, "");
const KC_REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const KC_CLIENT_ID =
  process.env.KEYCLOAK_SERVICE_CLIENT_ID || required("KEYCLOAK_CLIENT_ID");
const KC_CLIENT_SECRET =
  process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ||
  required("KEYCLOAK_CLIENT_SECRET");

const COOLIFY_BASE_URL = process.env.COOLIFY_BASE_URL?.replace(/\/$/, "") ?? "";
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN ?? "";
const COOLIFY_AVAILABLE = Boolean(COOLIFY_BASE_URL && COOLIFY_API_TOKEN);

const CLIENTS_EXPECTED = [
  {
    kcClientId: "outline",
    coolifyUuidEnv: "COOLIFY_OUTLINE_UUID",
    coolifyKind: "service",
    secretEnvKey: "OUTLINE_OIDC_CLIENT_SECRET",
    expectedRedirect: "https://knowledge.myperformance.pl/auth/oidc.callback",
  },
  {
    kcClientId: "directus",
    coolifyUuidEnv: "COOLIFY_DIRECTUS_UUID",
    coolifyKind: "service",
    secretEnvKey: "AUTH_KEYCLOAK_CLIENT_SECRET",
    expectedRedirect:
      "https://cms.myperformance.pl/auth/login/keycloak/callback",
  },
  {
    kcClientId: "documenso",
    coolifyUuidEnv: "COOLIFY_DOCUMENSO_UUID",
    coolifyKind: "service",
    secretEnvKey: "NEXT_PRIVATE_OIDC_CLIENT_SECRET",
    expectedRedirect: "https://sign.myperformance.pl/api/auth/callback/oidc",
  },
  {
    kcClientId: "moodle",
    coolifyUuidEnv: "COOLIFY_MOODLE_UUID",
    coolifyKind: "service",
    // Moodle auth_oidc plugin trzyma secret w `mdl_auth_oidc_config` w DB,
    // nie w env. Secret weryfikujemy tylko w KC — sync wymaga ręcznego
    // wpisania w Moodle → Site administration → Plugins → auth_oidc.
    secretEnvKey: null,
    expectedRedirect: "https://moodle.myperformance.pl/auth/oidc/",
  },
  {
    kcClientId: "postal",
    coolifyUuidEnv: "COOLIFY_POSTAL_UUID",
    coolifyKind: "service",
    secretEnvKey: "POSTAL_OIDC_CLIENT_SECRET",
    expectedRedirect: "https://postal.myperformance.pl/auth/oidc/callback",
  },
  {
    kcClientId: "stepca-oidc",
    coolifyUuidEnv: null,
    coolifyKind: null,
    secretEnvKey: null, // public client, PKCE
    expectedRedirect: null,
  },
];

const ROLES_EXPECTED = [
  "app_user",
  "knowledge_viewer",
  "knowledge_user",
  "knowledge_admin",
  "directus_admin",
  "postal_user",
  "postal_admin",
  "documenso_user",
  "documenso_handler",
  "documenso_admin",
  "chatwoot_agent",
  "chatwoot_administrator",
  "moodle_student",
  "moodle_editingteacher",
  "moodle_manager",
];

function color(code, s) {
  return `\x1b[${code}m${s}\x1b[0m`;
}
const OK = color("32", "OK");
const WARN = color("33", "WARN");
const FAIL = color("31", "FAIL");

async function getAdminToken() {
  const res = await fetch(
    `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: KC_CLIENT_ID,
        client_secret: KC_CLIENT_SECRET,
      }),
    },
  );
  if (!res.ok) throw new Error(`admin token: ${res.status}`);
  const body = await res.json();
  if (!body.access_token) throw new Error("no access_token");
  return body.access_token;
}

async function kc(path, token, init = {}) {
  return fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function listCoolifyEnvs(kind, uuid) {
  const base = kind === "application" ? "applications" : "services";
  const res = await fetch(
    `${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs`,
    { headers: { Authorization: `Bearer ${COOLIFY_API_TOKEN}` } },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function checkWellKnown() {
  const url = `${KC_URL}/realms/${KC_REALM}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`${FAIL} well-known openid-configuration: ${res.status}`);
    return false;
  }
  const body = await res.json();
  if (!body.issuer) {
    console.log(`${FAIL} well-known: brak pola issuer`);
    return false;
  }
  console.log(`${OK} well-known issuer=${body.issuer}`);
  return true;
}

async function checkRealmRoles(token) {
  console.log("\n=== Realm roles ===");
  for (const name of ROLES_EXPECTED) {
    const res = await kc(`/roles/${encodeURIComponent(name)}`, token);
    if (res.ok) {
      console.log(`${OK} role ${name}`);
    } else {
      console.log(`${FAIL} role ${name}: ${res.status} (uruchom scripts/keycloak-seed.mjs)`);
    }
  }
}

async function checkKcClient(token, spec) {
  const res = await kc(
    `/clients?clientId=${encodeURIComponent(spec.kcClientId)}`,
    token,
  );
  const list = res.ok ? await res.json() : [];
  if (!list.length) {
    console.log(`${FAIL} KC client ${spec.kcClientId}: BRAK (uruchom scripts/keycloak-seed.mjs)`);
    return null;
  }
  const c = list[0];
  const enabled = c.enabled !== false;
  const pub = c.publicClient === true;
  const hasRedirect =
    spec.expectedRedirect === null ||
    (Array.isArray(c.redirectUris) && c.redirectUris.includes(spec.expectedRedirect));

  const redirectStatus = hasRedirect ? OK : FAIL;
  console.log(
    `${enabled ? OK : FAIL} KC client ${spec.kcClientId}: enabled=${enabled} publicClient=${pub}`,
  );
  if (spec.expectedRedirect) {
    console.log(
      `  ${redirectStatus} redirect URI zawiera ${spec.expectedRedirect}`,
    );
    if (!hasRedirect) {
      console.log(
        `    aktualne: ${(c.redirectUris ?? []).join(", ") || "(puste)"}`,
      );
    }
  }

  // Secret
  if (!pub) {
    const secRes = await kc(`/clients/${c.id}/client-secret`, token);
    if (secRes.ok) {
      const sec = await secRes.json();
      if (sec.value && sec.value.length > 0) {
        console.log(`  ${OK} client secret obecny (len=${sec.value.length})`);
      } else {
        console.log(
          `  ${FAIL} client secret PUSTY — regeneruj (POST /clients/:id/client-secret)`,
        );
      }
    } else {
      console.log(`  ${WARN} secret lookup ${secRes.status}`);
    }
  }
  return c;
}

async function checkCoolifyEnv(spec) {
  if (!spec.coolifyUuidEnv || !spec.secretEnvKey) return;
  const uuid = process.env[spec.coolifyUuidEnv];
  if (!uuid) {
    console.log(`  ${WARN} Coolify env sprawdzenie: brak ${spec.coolifyUuidEnv}`);
    return;
  }
  try {
    const envs = await listCoolifyEnvs(spec.coolifyKind, uuid);
    const match = Array.isArray(envs)
      ? envs.find((e) => e.key === spec.secretEnvKey)
      : null;
    if (!match) {
      console.log(
        `  ${FAIL} Coolify ${spec.coolifyKind}/${spec.kcClientId}: brak env ${spec.secretEnvKey}`,
      );
    } else if (!match.value || String(match.value).length < 8) {
      console.log(
        `  ${FAIL} Coolify ${spec.kcClientId} ${spec.secretEnvKey}: wartość pusta/krótka`,
      );
    } else {
      console.log(
        `  ${OK} Coolify ${spec.kcClientId} ${spec.secretEnvKey} ustawiony (len=${String(match.value).length})`,
      );
    }
  } catch (err) {
    console.log(
      `  ${WARN} Coolify ${spec.kcClientId}: fetch envs failed — ${err.message}`,
    );
  }
}

async function main() {
  console.log(`[iam-verify] KC ${KC_URL} realm=${KC_REALM}`);
  console.log(
    `[iam-verify] Coolify ${COOLIFY_AVAILABLE ? COOLIFY_BASE_URL : "(NIEDOSTĘPNE — ustaw COOLIFY_BASE_URL + COOLIFY_API_TOKEN)"}`,
  );

  await checkWellKnown();

  const token = await getAdminToken();
  console.log(`${OK} service account token`);

  await checkRealmRoles(token);

  console.log("\n=== OIDC klienci ===");
  for (const spec of CLIENTS_EXPECTED) {
    console.log();
    await checkKcClient(token, spec);
    if (COOLIFY_AVAILABLE) {
      await checkCoolifyEnv(spec);
    }
  }

  console.log("\nGotowe. Sugestie naprawcze:");
  console.log("  - Braki ról/klientów  → node scripts/keycloak-seed.mjs");
  console.log(
    "  - Niezgodność secretu → node scripts/iam-sync-oidc-secrets.mjs (wymaga COOLIFY_*)",
  );
  console.log(
    "  - Outline 401 /auth.info → najczęściej OIDC_CLIENT_SECRET w Coolify != KC secret; po synchronizacji redeploy outline",
  );
}

main().catch((err) => {
  console.error(`[iam-verify] FAIL: ${err.message}`);
  process.exit(1);
});

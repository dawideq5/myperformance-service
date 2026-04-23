#!/usr/bin/env node
/**
 * Migracja KC realm ról: fine-grained → coarse (user/admin).
 *
 * Remap:
 *   chatwoot_agent          → chatwoot_user
 *   chatwoot_administrator  → chatwoot_admin
 *   moodle_student          → moodle_user
 *   moodle_editingteacher   → moodle_user
 *   moodle_manager          → moodle_admin
 *   documenso_handler       → documenso_user
 *   knowledge_viewer        → knowledge_user
 *
 * Nowe role dodawane (jeśli brak):
 *   chatwoot_user, chatwoot_admin, moodle_user, moodle_admin,
 *   directus_user, knowledge_user (już był), knowledge_admin (był),
 *   documenso_user (już był), documenso_admin (był),
 *   postal_user (był), postal_admin (był)
 *
 * Przebieg:
 *   1. Upewnij się że nowe role istnieją (ensureRealmRole)
 *   2. Dla każdej pary (old→new): pobierz userów z role old, dodaj im role new,
 *      usuń role old (od usera). Równoważne: rename per-user.
 *   3. Usuń stare role z realm po pełnym remapie.
 *   4. (Opcjonalnie) usuń custom role przypisane per-area (`<area>_custom_<x>`)
 *
 * Idempotentne. Dry-run przez MIGRATE_DRY_RUN=1.
 *
 * Uruchomienie:
 *   KEYCLOAK_URL=... KEYCLOAK_REALM=... \
 *     KEYCLOAK_SERVICE_CLIENT_ID=... KEYCLOAK_SERVICE_CLIENT_SECRET=... \
 *     [MIGRATE_DRY_RUN=1] \
 *     [MIGRATE_DELETE_LEGACY=1] \
 *     node scripts/migrate-roles-simplify.mjs
 */

import process from "node:process";

const required = (n) => {
  const v = process.env[n]?.trim();
  if (!v) throw new Error(`missing env: ${n}`);
  return v;
};

const KC_URL = required("KEYCLOAK_URL").replace(/\/$/, "");
const KC_REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const KC_CID =
  process.env.KEYCLOAK_SERVICE_CLIENT_ID || required("KEYCLOAK_CLIENT_ID");
const KC_CSEC =
  process.env.KEYCLOAK_SERVICE_CLIENT_SECRET || required("KEYCLOAK_CLIENT_SECRET");

const DRY = process.env.MIGRATE_DRY_RUN === "1";
const DELETE_LEGACY = process.env.MIGRATE_DELETE_LEGACY === "1";

const REMAP = {
  chatwoot_agent: "chatwoot_user",
  chatwoot_administrator: "chatwoot_admin",
  moodle_student: "moodle_user",
  moodle_editingteacher: "moodle_user",
  moodle_manager: "moodle_admin",
  documenso_handler: "documenso_user",
  knowledge_viewer: "knowledge_user",
};

// Role jakie mają istnieć po migracji (seed) — niezależnie od remapy.
const NEW_CANONICAL_ROLES = [
  { name: "chatwoot_user", description: "Chatwoot: agent (zwykły dostęp)." },
  { name: "chatwoot_admin", description: "Chatwoot: administrator." },
  { name: "moodle_user", description: "Moodle: dostęp do kursów." },
  { name: "moodle_admin", description: "Moodle: manager (admin)." },
  { name: "directus_user", description: "Directus: dostęp do CMS." },
  { name: "directus_admin", description: "Directus: administrator." },
  { name: "knowledge_user", description: "Outline: czytanie/pisanie wiki." },
  { name: "knowledge_admin", description: "Outline: administrator." },
  { name: "documenso_user", description: "Documenso: pracownik (podpisuje dokumenty)." },
  { name: "documenso_admin", description: "Documenso: administrator." },
  { name: "postal_user", description: "Postal: dostęp do przypisanych serwerów." },
  { name: "postal_admin", description: "Postal: administrator." },
];

// Po udanym remapie można skasować stare role z realmu.
const LEGACY_ROLES_TO_DELETE = Object.keys(REMAP);

// ---- Keycloak helpers ----
let tokenCache = null;
async function getToken() {
  if (tokenCache) return tokenCache;
  const res = await fetch(
    `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: KC_CID,
        client_secret: KC_CSEC,
      }),
    },
  );
  if (!res.ok) throw new Error(`admin token: ${res.status}`);
  const body = await res.json();
  tokenCache = body.access_token;
  return tokenCache;
}

async function kc(path, init = {}) {
  const token = await getToken();
  return fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function findRole(name) {
  const r = await kc(`/roles/${encodeURIComponent(name)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`find role ${name}: ${r.status}`);
  return r.json();
}

async function ensureRealmRole({ name, description }) {
  const existing = await findRole(name);
  if (existing) {
    console.log(`  role ${name} OK`);
    return existing;
  }
  if (DRY) {
    console.log(`  [DRY] would create role ${name}`);
    return { name, id: "dry-run", containerId: "dry-run" };
  }
  const create = await kc(`/roles`, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`create role ${name}: ${create.status} ${await create.text()}`);
  }
  console.log(`  role ${name} CREATED`);
  return await findRole(name);
}

async function listUsersWithRole(roleName) {
  const out = [];
  let first = 0;
  const pageSize = 100;
  for (;;) {
    const res = await kc(
      `/roles/${encodeURIComponent(roleName)}/users?first=${first}&max=${pageSize}`,
    );
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`list users for ${roleName}: ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (!Array.isArray(page) || page.length < pageSize) return out;
    first += pageSize;
  }
}

async function addRealmRoleToUser(userId, role) {
  if (DRY) return;
  const res = await kc(`/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify([{ id: role.id, name: role.name, containerId: role.containerId }]),
  });
  if (!res.ok) throw new Error(`add role ${role.name} to ${userId}: ${res.status}`);
}

async function removeRealmRoleFromUser(userId, role) {
  if (DRY) return;
  const res = await kc(`/users/${userId}/role-mappings/realm`, {
    method: "DELETE",
    body: JSON.stringify([{ id: role.id, name: role.name, containerId: role.containerId }]),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`remove role ${role.name} from ${userId}: ${res.status}`);
  }
}

async function deleteRole(name) {
  if (DRY) {
    console.log(`  [DRY] would delete role ${name}`);
    return;
  }
  const res = await kc(`/roles/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    console.warn(`  delete role ${name}: ${res.status}`);
    return;
  }
  console.log(`  role ${name} DELETED`);
}

// ---- Main ----
async function main() {
  console.log(`[migrate-roles-simplify] KC=${KC_URL} realm=${KC_REALM} DRY=${DRY ? "yes" : "no"} DELETE_LEGACY=${DELETE_LEGACY ? "yes" : "no"}`);

  console.log("\n=== 1) Ensure canonical roles ===");
  for (const r of NEW_CANONICAL_ROLES) await ensureRealmRole(r);

  console.log("\n=== 2) Remap per-user ===");
  let totalUsers = 0;
  for (const [oldName, newName] of Object.entries(REMAP)) {
    const oldRole = await findRole(oldName);
    if (!oldRole) {
      console.log(`  [${oldName}] role nie istnieje — skip`);
      continue;
    }
    const newRole = await findRole(newName);
    if (!newRole) {
      console.warn(`  [${oldName}] target role ${newName} NOT FOUND — skip`);
      continue;
    }
    const users = await listUsersWithRole(oldName);
    console.log(`  [${oldName}→${newName}] ${users.length} user(ów)`);
    for (const u of users) {
      try {
        await addRealmRoleToUser(u.id, newRole);
        await removeRealmRoleFromUser(u.id, oldRole);
        totalUsers += 1;
      } catch (err) {
        console.warn(
          `    user ${u.username || u.email || u.id}: ${err.message}`,
        );
      }
    }
  }
  console.log(`  łącznie zmigrowano user-role mappingów: ${totalUsers}`);

  if (DELETE_LEGACY) {
    console.log("\n=== 3) Delete legacy roles from realm ===");
    for (const name of LEGACY_ROLES_TO_DELETE) {
      await deleteRole(name);
    }
  } else {
    console.log(
      "\n(Pomijam usuwanie starych ról — ustaw MIGRATE_DELETE_LEGACY=1 żeby je skasować)",
    );
  }

  console.log("\n[migrate-roles-simplify] DONE");
}

main().catch((err) => {
  console.error("[migrate-roles-simplify] FAIL:", err);
  process.exit(1);
});

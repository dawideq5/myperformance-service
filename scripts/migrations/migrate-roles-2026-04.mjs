#!/usr/bin/env node
/**
 * Migracja ról realmu na model 2026-04:
 *
 *   chatwoot_user       → chatwoot_agent
 *   documenso_user      → documenso_member
 *   documenso_handler   → documenso_manager
 *   knowledge_user      → knowledge_editor
 *   moodle_user         → moodle_student
 *   moodle_admin        → moodle_manager
 *
 * Dla każdej legacy role:
 *   1. Pobiera listę userów posiadających legacy rolę.
 *   2. Ensure target role istnieje (seed-area-roles powinno być przed).
 *   3. Dodaje target rolę każdemu userowi.
 *   4. Usuwa legacy rolę od usera.
 *   5. Po opróżnieniu — usuwa legacy rolę z realmu (chyba że `KEEP_LEGACY=1`).
 *
 * Dodatkowo kasuje role z obszarów które przeszły na "admin-only"
 * (directus_user, postal_user) — bez remapu (użytkownik stracił rolę).
 *
 * Usage:
 *   KEYCLOAK_URL=... KEYCLOAK_ADMIN_CLIENT_ID=... KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *     node scripts/migrations/migrate-roles-2026-04.mjs
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || REALM;
const KEEP_LEGACY = process.env.KEEP_LEGACY === "1";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[migrate-roles-2026-04] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

const REMAP = {
  chatwoot_user: "chatwoot_agent",
  documenso_user: "documenso_member",
  documenso_handler: "documenso_manager",
  knowledge_user: "knowledge_editor",
  moodle_user: "moodle_student",
  moodle_admin: "moodle_manager",
};

// Role do usunięcia bez następcy (obszar przeszedł na admin-only,
// użytkownik stracił dostęp bazowy do narzędzia).
const REMOVE_WITHOUT_REMAP = ["directus_user", "postal_user"];

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
    throw new Error(
      "Ustaw KEYCLOAK_ADMIN_CLIENT_ID+SECRET lub KEYCLOAK_ADMIN_USER+PASSWORD",
    );
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

async function getRoleByName(token, name) {
  const res = await kcFetch(token, `/roles/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getRole ${name}: ${res.status}`);
  return await res.json();
}

async function listUsersOfRole(token, roleName) {
  // Paginate.
  const all = [];
  const pageSize = 100;
  let first = 0;
  for (let i = 0; i < 20; i++) {
    const res = await kcFetch(
      token,
      `/roles/${encodeURIComponent(roleName)}/users?first=${first}&max=${pageSize}`,
    );
    if (!res.ok) throw new Error(`listUsersOfRole ${roleName}: ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    first += pageSize;
  }
  return all;
}

async function addRoleToUser(token, userId, role) {
  const res = await kcFetch(token, `/users/${userId}/role-mappings/realm`, {
    method: "POST",
    body: JSON.stringify([role]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`addRoleToUser ${userId}: ${res.status} ${text}`);
  }
}

async function removeRoleFromUser(token, userId, role) {
  const res = await kcFetch(token, `/users/${userId}/role-mappings/realm`, {
    method: "DELETE",
    body: JSON.stringify([role]),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`removeRoleFromUser ${userId}: ${res.status} ${text}`);
  }
}

async function deleteRole(token, name) {
  const res = await kcFetch(token, `/roles/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`deleteRole ${name}: ${res.status} ${text}`);
  }
}

async function migrateRole(token, legacyName, targetName) {
  const legacy = await getRoleByName(token, legacyName);
  if (!legacy) {
    console.log(`[skip] ${legacyName} nie istnieje`);
    return;
  }
  const target = await getRoleByName(token, targetName);
  if (!target) {
    console.error(
      `[error] ${legacyName} → ${targetName}: target nie istnieje. Uruchom seed-area-roles.mjs najpierw.`,
    );
    process.exitCode = 3;
    return;
  }
  const users = await listUsersOfRole(token, legacyName);
  console.log(`[migrate] ${legacyName} → ${targetName}: ${users.length} userów`);
  for (const u of users) {
    try {
      await addRoleToUser(token, u.id, {
        id: target.id,
        name: target.name,
      });
      await removeRoleFromUser(token, u.id, {
        id: legacy.id,
        name: legacy.name,
      });
    } catch (err) {
      console.error(`  [fail] ${u.username}: ${err.message}`);
    }
  }
  if (!KEEP_LEGACY) {
    await deleteRole(token, legacyName);
    console.log(`[cleanup] usunięto rolę ${legacyName}`);
  }
}

async function removeRole(token, name) {
  const role = await getRoleByName(token, name);
  if (!role) {
    console.log(`[skip] ${name} nie istnieje`);
    return;
  }
  const users = await listUsersOfRole(token, name);
  console.log(`[remove] ${name}: odbieramy ${users.length} userom i kasujemy rolę`);
  for (const u of users) {
    try {
      await removeRoleFromUser(token, u.id, { id: role.id, name: role.name });
    } catch (err) {
      console.error(`  [fail] ${u.username}: ${err.message}`);
    }
  }
  if (!KEEP_LEGACY) {
    await deleteRole(token, name);
  }
}

async function main() {
  console.log(`[migrate-roles-2026-04] realm=${REALM} at ${KEYCLOAK_URL}`);
  console.log(`[migrate-roles-2026-04] KEEP_LEGACY=${KEEP_LEGACY ? "1" : "0"}`);
  const token = await getAccessToken();
  for (const [legacy, target] of Object.entries(REMAP)) {
    await migrateRole(token, legacy, target);
  }
  for (const name of REMOVE_WITHOUT_REMAP) {
    await removeRole(token, name);
  }
  console.log("[migrate-roles-2026-04] done");
}

main().catch((err) => {
  console.error("[migrate-roles-2026-04] FAILED:", err);
  process.exit(1);
});

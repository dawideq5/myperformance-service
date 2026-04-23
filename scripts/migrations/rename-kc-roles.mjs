#!/usr/bin/env node
/**
 * Idempotentny rename ról realm: stara nazwa → nowa nazwa.
 *
 * Dla każdej pary (old → new):
 *   1. Upewnia się że new role istnieje (create z description starej roli).
 *   2. Znajduje wszystkich userów z old role (/roles/{old}/users).
 *   3. Dodaje new role do tych userów, usuwa old role.
 *   4. Usuwa old role z realmu.
 *
 * Uruchamiać po deployu nowej wersji dashboarda (AREAS już zaktualizowany).
 *
 * Usage:
 *   KEYCLOAK_URL=https://auth.myperformance.pl \
 *   KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_CLIENT_ID=admin-cli \
 *   KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *     node scripts/rename-kc-roles.mjs [--dry-run]
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || REALM;
const DRY_RUN = process.argv.includes("--dry-run");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[rename-kc-roles] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

// Pary do migracji — dopasowane do refaktoru AREAS registry.
const RENAMES = [
  { from: "chatwoot_admin", to: "chatwoot_administrator" },
  { from: "moodle_teacher", to: "moodle_editingteacher" },
  { from: "moodle_admin", to: "moodle_manager" },
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
      "[rename-kc-roles] Ustaw KEYCLOAK_ADMIN_CLIENT_ID+SECRET lub KEYCLOAK_ADMIN_USER+PASSWORD",
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

async function getRole(token, name) {
  const res = await kcFetch(token, `/roles/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`probe role ${name}: ${res.status} ${body}`);
  }
  return res.json();
}

async function ensureNewRole(token, oldRole, newName) {
  const existing = await getRole(token, newName);
  if (existing) return existing;
  if (DRY_RUN) {
    console.log(`[rename-kc-roles] [dry-run] would create role ${newName}`);
    return { name: newName, description: oldRole?.description };
  }
  const create = await kcFetch(token, "/roles", {
    method: "POST",
    body: JSON.stringify({
      name: newName,
      description: oldRole?.description,
      attributes: oldRole?.attributes,
    }),
  });
  if (!create.ok && create.status !== 409) {
    const body = await create.text().catch(() => "");
    throw new Error(`create role ${newName}: ${create.status} ${body}`);
  }
  console.log(`[rename-kc-roles] created new role: ${newName}`);
  return (await getRole(token, newName)) ?? { name: newName };
}

async function listUsersWithRole(token, roleName) {
  const collected = [];
  const pageSize = 100;
  let first = 0;
  for (;;) {
    const res = await kcFetch(
      token,
      `/roles/${encodeURIComponent(roleName)}/users?first=${first}&max=${pageSize}`,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`list users ${roleName}: ${res.status} ${body}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
    first += pageSize;
  }
  return collected;
}

async function updateUserRoles(token, userId, { add, remove }) {
  if (remove.length > 0) {
    const res = await kcFetch(
      token,
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: "DELETE", body: JSON.stringify(remove) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`remove roles user=${userId}: ${res.status} ${body}`);
    }
  }
  if (add.length > 0) {
    const res = await kcFetch(
      token,
      `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      { method: "POST", body: JSON.stringify(add) },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`add roles user=${userId}: ${res.status} ${body}`);
    }
  }
}

async function deleteRole(token, name) {
  const res = await kcFetch(token, `/roles/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`delete role ${name}: ${res.status} ${body}`);
  }
}

async function migrate(token, pair) {
  console.log(`[rename-kc-roles] ${pair.from} → ${pair.to}`);
  const oldRole = await getRole(token, pair.from);
  if (!oldRole) {
    console.log(`[rename-kc-roles]   old role not found — nothing to migrate`);
    // Upewnijmy się że nowa istnieje (defensywnie).
    await ensureNewRole(token, null, pair.to);
    return;
  }

  const newRole = await ensureNewRole(token, oldRole, pair.to);

  const users = await listUsersWithRole(token, pair.from);
  console.log(`[rename-kc-roles]   ${users.length} user(ów) do migracji`);

  if (DRY_RUN) {
    for (const u of users) {
      console.log(`[rename-kc-roles]   [dry-run] ${u.username} (${u.id})`);
    }
    console.log(`[rename-kc-roles]   [dry-run] would delete role ${pair.from}`);
    return;
  }

  for (const u of users) {
    try {
      await updateUserRoles(token, u.id, {
        add: [{ id: newRole.id, name: newRole.name }],
        remove: [{ id: oldRole.id, name: oldRole.name }],
      });
      console.log(`[rename-kc-roles]   migrated ${u.username}`);
    } catch (err) {
      console.error(`[rename-kc-roles]   FAILED user=${u.username}: ${err.message}`);
      throw err;
    }
  }

  await deleteRole(token, pair.from);
  console.log(`[rename-kc-roles]   deleted old role ${pair.from}`);
}

async function main() {
  console.log(
    `[rename-kc-roles] realm=${REALM} at ${KEYCLOAK_URL}${DRY_RUN ? " (DRY RUN)" : ""}`,
  );
  const token = await getAccessToken();
  for (const pair of RENAMES) {
    await migrate(token, pair);
  }
  console.log(`[rename-kc-roles] done — ${RENAMES.length} par sprawdzonych`);
}

main().catch((err) => {
  console.error("[rename-kc-roles] FAILED:", err);
  process.exit(1);
});

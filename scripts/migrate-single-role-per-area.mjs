#!/usr/bin/env node
/**
 * Jednorazowa migracja: wymuszenie single-role-per-area dla wszystkich userów.
 *
 * Iteruje userów KC, dla każdego wyznacza zbiór ról per area (po prefiksie +
 * seed names). Gdy user ma >1 rolę w area → trzyma najwyższą priorytetowo,
 * resztę usuwa.
 *
 * Flagi:
 *   --dry-run   (default: ON) — tylko loguje, nie modyfikuje KC
 *   --apply     przełącza w tryb write
 *
 * Usage:
 *   KEYCLOAK_URL=... KEYCLOAK_ADMIN_CLIENT_ID=... KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *     node scripts/migrate-single-role-per-area.mjs --apply
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || REALM;
const APPLY = process.argv.includes("--apply");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[migrate] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

// Lustro AREAS z `lib/permissions/areas.ts`. Kolejność jak tam.
const AREAS = [
  {
    id: "chatwoot",
    prefix: "chatwoot_",
    roles: [
      { name: "chatwoot_agent", priority: 10 },
      { name: "chatwoot_admin", priority: 90 },
    ],
  },
  {
    id: "moodle",
    prefix: "moodle_",
    roles: [
      { name: "moodle_student", priority: 10 },
      { name: "moodle_teacher", priority: 50 },
      { name: "moodle_admin", priority: 90 },
    ],
  },
  {
    id: "directus",
    prefix: "directus_",
    roles: [{ name: "directus_admin", priority: 90 }],
  },
  {
    id: "documenso",
    prefix: "documenso_",
    roles: [
      { name: "documenso_user", priority: 10 },
      { name: "documenso_handler", priority: 50 },
      { name: "documenso_admin", priority: 90 },
    ],
  },
  {
    id: "knowledge",
    prefix: "knowledge_",
    roles: [
      { name: "knowledge_user", priority: 10 },
      { name: "knowledge_admin", priority: 90 },
    ],
  },
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
    console.error("[migrate] Ustaw KEYCLOAK_ADMIN_CLIENT_ID+SECRET lub KEYCLOAK_ADMIN_USER+PASSWORD");
    process.exit(2);
  }
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
  );
  if (!res.ok) {
    throw new Error(`Token fetch: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function kcFetch(token, path, init = {}) {
  return fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
}

async function listUsers(token) {
  const out = [];
  const PAGE = 100;
  let first = 0;
  while (true) {
    const res = await kcFetch(token, `/users?first=${first}&max=${PAGE}`);
    if (!res.ok) throw new Error(`list users: ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    first += PAGE;
  }
  return out;
}

async function userRoles(token, userId) {
  const res = await kcFetch(token, `/users/${userId}/role-mappings/realm`);
  if (!res.ok) throw new Error(`user roles: ${res.status}`);
  return res.json();
}

async function removeRoles(token, userId, roles) {
  const res = await kcFetch(token, `/users/${userId}/role-mappings/realm`, {
    method: "DELETE",
    body: JSON.stringify(roles),
  });
  if (!res.ok) {
    throw new Error(`remove roles: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log(`[migrate] realm=${REALM} apply=${APPLY ? "YES" : "DRY-RUN"}`);
  const token = await getAccessToken();
  const users = await listUsers(token);
  console.log(`[migrate] loaded ${users.length} users`);

  let totalRemoved = 0;
  for (const u of users) {
    const roles = await userRoles(token, u.id);
    const removals = [];
    for (const area of AREAS) {
      const areaRoles = roles.filter(
        (r) => r.name.startsWith(area.prefix),
      );
      if (areaRoles.length <= 1) continue;
      // Wybieramy rolę z najwyższym priorytetem (seeded) lub pierwszą custom.
      const best = areaRoles.reduce((acc, cur) => {
        const accSeed = area.roles.find((s) => s.name === acc.name);
        const curSeed = area.roles.find((s) => s.name === cur.name);
        const accPrio = accSeed?.priority ?? 50;
        const curPrio = curSeed?.priority ?? 50;
        return curPrio > accPrio ? cur : acc;
      });
      for (const r of areaRoles) {
        if (r.name !== best.name) removals.push(r);
      }
      console.log(
        `[migrate] ${u.email || u.username} area=${area.id} keep=${best.name} drop=${areaRoles
          .filter((r) => r.name !== best.name)
          .map((r) => r.name)
          .join(",")}`,
      );
    }
    if (removals.length === 0) continue;
    totalRemoved += removals.length;
    if (APPLY) {
      await removeRoles(token, u.id, removals);
    }
  }

  console.log(
    `[migrate] ${APPLY ? "DONE" : "DRY-RUN DONE"}: total role removals=${totalRemoved}`,
  );
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});

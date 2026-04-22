#!/usr/bin/env node
/**
 * Bulk resync: Keycloak → natywne aplikacje (Moodle/Chatwoot/Outline/
 * Directus/Documenso/Postal).
 *
 * Dla każdego usera KC:
 *   1. Wyznacza jego realm role.
 *   2. Per area (AREAS w lib/permissions/areas.ts): bierze najwyższą
 *      priorytetem rolę usera w tym area.
 *   3. Wywołuje endpoint dashboardu POST /api/admin/bulk/area-role
 *      (lub direct API każdej apki w trybie --standalone).
 *   4. Loguje per-area status.
 *
 * Używa service-account tokenu dashboardu (KEYCLOAK_SERVICE_CLIENT_ID +
 * SECRET) aby autoryzować się do dashboardu API.
 *
 * Usage:
 *   KEYCLOAK_URL=https://auth.myperformance.pl \
 *   KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_USER=admin \
 *   KEYCLOAK_ADMIN_PASSWORD=... \
 *   DASHBOARD_URL=https://myperformance.pl \
 *   DASHBOARD_ADMIN_COOKIE=<next-auth session cookie> \
 *     node scripts/sync-all-users.mjs
 *
 * Tryb standalone (bez dashboardu — bezpośrednie wywołania native APIs):
 *   MOODLE_URL=... MOODLE_API_TOKEN=... \
 *   OUTLINE_URL=... OUTLINE_API_TOKEN=... \
 *   CHATWOOT_URL=... CHATWOOT_PLATFORM_TOKEN=... CHATWOOT_ACCOUNT_ID=1 \
 *   DIRECTUS_URL=... DIRECTUS_ADMIN_TOKEN=... \
 *     node scripts/sync-all-users.mjs --standalone
 */

const KC_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const STANDALONE = process.argv.includes("--standalone");
const DRY_RUN = process.argv.includes("--dry-run");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[sync] Missing env ${name}`);
    process.exit(2);
  }
  return v;
}

// Mirror AREAS z lib/permissions/areas.ts (priorytet + nativeRoleId).
const AREAS = [
  {
    id: "chatwoot",
    provider: "chatwoot",
    kcRoles: [
      { name: "chatwoot_agent", priority: 10, nativeRoleId: "agent" },
      { name: "chatwoot_administrator", priority: 90, nativeRoleId: "administrator" },
    ],
  },
  {
    id: "moodle",
    provider: "moodle",
    kcRoles: [
      { name: "moodle_student", priority: 10, nativeRoleId: "student" },
      { name: "moodle_editingteacher", priority: 50, nativeRoleId: "editingteacher" },
      { name: "moodle_manager", priority: 90, nativeRoleId: "manager" },
    ],
  },
  {
    id: "directus",
    provider: "directus",
    // Directus ma dynamiczne id roli (UUID) — nativeRoleId=null znaczy
    // "rola Administrator z admin_access=true". Dashboard rozstrzyga
    // przez findAdminRole() w providerze.
    kcRoles: [{ name: "directus_admin", priority: 90, nativeRoleId: null }],
  },
  {
    id: "knowledge",
    provider: "outline",
    kcRoles: [
      { name: "knowledge_viewer", priority: 5, nativeRoleId: "viewer" },
      { name: "knowledge_user", priority: 10, nativeRoleId: "member" },
      { name: "knowledge_admin", priority: 90, nativeRoleId: "admin" },
    ],
  },
];

async function getAdminToken() {
  const user = process.env.KEYCLOAK_ADMIN_USER;
  const pwd = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!user || !pwd) {
    console.error("[sync] Provide KEYCLOAK_ADMIN_USER + KEYCLOAK_ADMIN_PASSWORD");
    process.exit(2);
  }
  const res = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: user,
      password: pwd,
    }),
  });
  if (!res.ok) throw new Error(`admin token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function kcGet(path, token) {
  const res = await fetch(`${KC_URL}/admin/realms/${REALM}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`KC GET ${path} → ${res.status}`);
  }
  return res.json();
}

async function listUsers(token) {
  const out = [];
  let first = 0;
  while (true) {
    const batch = await kcGet(
      `/users?first=${first}&max=100&briefRepresentation=false`,
      token,
    );
    if (!batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
    first += 100;
  }
  return out;
}

async function userRealmRoles(token, userId) {
  return kcGet(`/users/${userId}/role-mappings/realm`, token);
}

// --- Native providers (standalone mode) ------------------------------

async function moodleCall(fn, params = {}) {
  const url = `${process.env.MOODLE_URL.replace(/\/$/, "")}/webservice/rest/server.php`;
  const body = new URLSearchParams();
  body.set("wstoken", process.env.MOODLE_API_TOKEN);
  body.set("wsfunction", fn);
  body.set("moodlewsrestformat", "json");
  flatten(params, body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (data && data.exception) throw new Error(`Moodle ${fn}: ${data.message}`);
  return data;
}

function flatten(obj, body, prefix = "") {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const ik = `${key}[${i}]`;
        if (item !== null && typeof item === "object") flatten(item, body, ik);
        else body.set(ik, String(item));
      });
    } else if (v !== null && typeof v === "object") flatten(v, body, key);
    else if (v !== undefined && v !== null) body.set(key, String(v));
  }
}

const MOODLE_FALLBACK_IDS = {
  manager: 1, coursecreator: 2, editingteacher: 3, teacher: 4, student: 5,
};
const MOODLE_MANAGED = new Set(["manager", "editingteacher", "student"]);

async function syncMoodle({ email, firstName, lastName, phone, areaRole }) {
  let user;
  const existing = await moodleCall("core_user_get_users_by_field", { field: "email", values: [email] });
  user = existing?.[0];
  if (!user) {
    const display = [firstName, lastName].filter(Boolean).join(" ") || email;
    const [fn, ...rest] = display.split(" ");
    const ln = rest.join(" ") || fn || "User";
    const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
    const buf = new Uint8Array(20);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    const created = await moodleCall("core_user_create_users", {
      users: [{ username, password: `Mp!${hex}Ax9`, firstname: fn || email, lastname: ln, email, auth: "oidc", createpassword: 0 }],
    });
    user = { id: Array.isArray(created) ? created[0].id : null, email };
  } else {
    const upd = { id: user.id };
    if (firstName && firstName !== user.firstname) upd.firstname = firstName;
    if (lastName && lastName !== user.lastname) upd.lastname = lastName;
    if (phone && phone !== user.phone1) upd.phone1 = phone;
    if (Object.keys(upd).length > 1) {
      await moodleCall("core_user_update_users", { users: [upd] });
    }
  }
  // Role
  const targetShortname = areaRole?.nativeRoleId;
  const currentShortnames = new Set((user.roles ?? []).map((r) => r.shortname));
  for (const sh of MOODLE_MANAGED) {
    if (currentShortnames.has(sh) && sh !== targetShortname) {
      const rid = MOODLE_FALLBACK_IDS[sh];
      await moodleCall("core_role_unassign_roles", {
        unassignments: [{ roleid: rid, userid: user.id, contextid: 1 }],
      }).catch(() => {});
    }
  }
  if (targetShortname && !currentShortnames.has(targetShortname)) {
    const rid = MOODLE_FALLBACK_IDS[targetShortname];
    if (rid) {
      await moodleCall("core_role_assign_roles", {
        assignments: [{ roleid: rid, userid: user.id, contextid: 1 }],
      });
    }
  }
}

async function outlineFetch(path, body) {
  const url = `${process.env.OUTLINE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OUTLINE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Outline ${path}: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.data ?? j;
}

async function syncOutline({ email, firstName, lastName, areaRole }) {
  const users = await outlineFetch("/api/users.list", { query: email, filter: "all", limit: 25 });
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return; // JIT przy SSO.
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (fullName && fullName !== user.name) {
    await outlineFetch("/api/users.update", { id: user.id, name: fullName });
  }
  const target = areaRole?.nativeRoleId;
  if (!target) {
    if (!user.isSuspended) await outlineFetch("/api/users.suspend", { id: user.id });
    return;
  }
  if (user.isSuspended) await outlineFetch("/api/users.activate", { id: user.id });
  if (user.role !== target) {
    await outlineFetch("/api/users.update_role", { id: user.id, role: target });
  }
}

async function chatwootFetch(path, init = {}) {
  const base = process.env.CHATWOOT_URL.replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      api_access_token: process.env.CHATWOOT_PLATFORM_TOKEN,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function syncChatwoot({ email, firstName, lastName, areaRole }) {
  const acct = Number(process.env.CHATWOOT_ACCOUNT_ID || "1");
  const searchRes = await chatwootFetch(`/platform/api/v1/users?q=${encodeURIComponent(email)}`);
  if (!searchRes.ok) return;
  const data = await searchRes.json();
  const list = Array.isArray(data) ? data : data.data ?? [];
  let user = list.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email;
  if (!user) {
    // Tworzenie wymaga hasła — spełniającego politykę; jednorazowe.
    const pwd = `Cw!${cryptoRandom(16)}Zz9`;
    const create = await chatwootFetch(`/platform/api/v1/users`, {
      method: "POST",
      body: JSON.stringify({
        name: fullName,
        email,
        password: pwd,
        custom_attributes: { source: "keycloak-sso" },
      }),
    });
    if (!create.ok) return;
    user = await create.json();
  } else {
    const patch = {};
    if (fullName !== user.name) patch.name = fullName;
    if (Object.keys(patch).length > 0) {
      await chatwootFetch(`/platform/api/v1/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    }
  }
  const target = areaRole?.nativeRoleId;
  if (!target) {
    // remove membership
    await chatwootFetch(`/platform/api/v1/accounts/${acct}/account_users`, {
      method: "DELETE",
      body: JSON.stringify({ user_id: user.id }),
    }).catch(() => {});
    return;
  }
  await chatwootFetch(`/platform/api/v1/accounts/${acct}/account_users`, {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, role: target }),
  }).catch(async () => {
    // Może istnieć — wtedy POST zwróci 422. Spróbujmy PATCH.
    await chatwootFetch(`/platform/api/v1/accounts/${acct}/account_users`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: user.id, role: target }),
    });
  });
}

async function directusFetch(path, init = {}) {
  const base = process.env.DIRECTUS_URL.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.DIRECTUS_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Directus ${path}: ${res.status}`);
  if (res.status === 204) return null;
  const j = await res.json();
  return j.data ?? j;
}

async function syncDirectus({ email, firstName, lastName, areaRole }) {
  const users = await directusFetch(
    `/users?filter[email][_eq]=${encodeURIComponent(email.toLowerCase())}&limit=1&fields=id,email,role,first_name,last_name`,
  ).catch(() => []);
  const user = users[0];
  if (!user) return; // SSO stworzy.
  const patch = {};
  if (firstName && firstName !== user.first_name) patch.first_name = firstName;
  if (lastName && lastName !== user.last_name) patch.last_name = lastName;
  // Role — tylko directus_admin mapuje do natywnej roli Administrator.
  if (areaRole?.name === "directus_admin") {
    // Znajdź Administrator rolę.
    const roles = await directusFetch(
      `/roles?filter[admin_access][_eq]=true&limit=1&fields=id,name,admin_access`,
    ).catch(() => []);
    if (roles[0]) patch.role = roles[0].id;
  }
  if (Object.keys(patch).length > 0) {
    await directusFetch(`/users/${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }
}

function cryptoRandom(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Main ------------------------------------------------------------

async function main() {
  if (!STANDALONE) {
    console.error("[sync] --standalone mode jest obecnie jedyny wspierany trybem.");
    process.exit(2);
  }
  console.log(`[sync] realm=${REALM} url=${KC_URL} dryRun=${DRY_RUN}`);
  const token = await getAdminToken();
  const users = await listUsers(token);
  console.log(`[sync] ${users.length} userów w realmie`);

  for (const u of users) {
    if (!u.email) {
      console.log(`  - ${u.username}: skip (brak email)`);
      continue;
    }
    const roles = await userRealmRoles(token, u.id);
    const roleNames = new Set(roles.map((r) => r.name));
    const firstName = u.firstName || "";
    const lastName = u.lastName || "";
    const phone = u.attributes?.phoneNumber?.[0] ?? u.attributes?.phone?.[0] ?? null;
    console.log(`  * ${u.email} (${u.firstName ?? ""} ${u.lastName ?? ""})`);

    for (const area of AREAS) {
      const matches = area.kcRoles.filter((r) => roleNames.has(r.name));
      const chosen = matches.reduce(
        (best, cur) => (!best || cur.priority > best.priority ? cur : best),
        null,
      );
      const label = chosen ? chosen.name : "(brak — null)";
      if (DRY_RUN) {
        console.log(`      ${area.id} → ${label}`);
        continue;
      }
      try {
        if (area.provider === "moodle") await syncMoodle({ email: u.email, firstName, lastName, phone, areaRole: chosen });
        else if (area.provider === "outline") await syncOutline({ email: u.email, firstName, lastName, areaRole: chosen });
        else if (area.provider === "chatwoot") await syncChatwoot({ email: u.email, firstName, lastName, areaRole: chosen });
        else if (area.provider === "directus") await syncDirectus({ email: u.email, firstName, lastName, areaRole: chosen });
        console.log(`      ${area.id} → ${label} ✓`);
      } catch (err) {
        console.log(`      ${area.id} → ${label} ✗ ${err.message}`);
      }
    }
  }
  console.log("[sync] done");
}

main().catch((err) => {
  console.error("[sync] FAILED:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Remove legacy user-level roles that were collapsed into admin-only gating.
 *
 * Roles deleted:
 *   - documents_user    (tab "Moje dokumenty" usunięta, funkcja odpada z dashboardu)
 *   - directus_access   (Directus staje się admin-only → używamy directus_admin)
 *   - usesend_user      (Listmonk/Usesend staje się admin-only → usesend_admin)
 *   - stepca_user       (step-ca self-service widoczne tylko dla stepca_admin)
 *
 * Zanim usunie rolę, zdejmuje ją z `default-roles-<realm>` composite
 * (documents_user był default). DELETE /roles/{name} zwraca 404 jeżeli
 * roli już nie ma → idempotent.
 *
 * Usage: identyczny jak keycloak-seed.mjs.
 */

const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";

const ROLES_TO_DELETE = [
  "documents_user",
  "directus_access",
  "usesend_user",
  "stepca_user",
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[kc-delete] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

async function getAdminToken() {
  const user = process.env.KEYCLOAK_ADMIN_USER;
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
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
    console.error("[kc-delete] Provide KEYCLOAK_ADMIN_USER/PASSWORD or KEYCLOAK_ADMIN_CLIENT_ID/SECRET");
    process.exit(2);
  }
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
  );
  if (!res.ok) throw new Error(`admin token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function kc(path, token, init = {}) {
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

async function removeFromDefaults(token, roleName) {
  const defaultRoleName = `default-roles-${REALM.toLowerCase()}`;
  const roleRes = await kc(`/roles/${encodeURIComponent(roleName)}`, token);
  if (!roleRes.ok) return;
  const role = await roleRes.json();

  const composites = await kc(`/roles/${encodeURIComponent(defaultRoleName)}/composites/realm`, token);
  if (!composites.ok) return;
  const list = await composites.json();
  if (!list.some((r) => r.name === roleName)) return;

  const del = await kc(`/roles/${encodeURIComponent(defaultRoleName)}/composites`, token, {
    method: "DELETE",
    body: JSON.stringify([{ id: role.id, name: role.name, containerId: role.containerId }]),
  });
  if (!del.ok) {
    throw new Error(`remove ${roleName} from default composite: ${del.status} ${await del.text()}`);
  }
  console.log(`[composite] removed ${roleName} from ${defaultRoleName}`);
}

async function deleteRole(token, roleName) {
  await removeFromDefaults(token, roleName);
  const del = await kc(`/roles/${encodeURIComponent(roleName)}`, token, { method: "DELETE" });
  if (del.status === 204) {
    console.log(`[role] deleted ${roleName}`);
    return;
  }
  if (del.status === 404) {
    console.log(`[role] ${roleName} already absent`);
    return;
  }
  throw new Error(`delete role ${roleName}: ${del.status} ${await del.text()}`);
}

async function main() {
  console.log(`[kc-delete] realm=${REALM} url=${KEYCLOAK_URL}`);
  const token = await getAdminToken();
  for (const r of ROLES_TO_DELETE) {
    await deleteRole(token, r);
  }
  console.log("[kc-delete] done");
}

main().catch((err) => { console.error("[kc-delete] FAILED:", err); process.exit(1); });

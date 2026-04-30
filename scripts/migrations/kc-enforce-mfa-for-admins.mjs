#!/usr/bin/env node
/**
 * KC: Enforce MFA dla użytkowników z rolą `admin` / `realm-admin` / `manage-realm`.
 *
 * Idempotentny — jeśli user ma już CONFIGURE_TOTP w requiredActions, skip.
 * Source-of-truth dla MFA policy: AUDIT.md §1.2.2 (P1).
 *
 * Wymagane env:
 *   KEYCLOAK_URL                — np. https://auth.myperformance.pl
 *   KEYCLOAK_REALM              — np. MyPerformance
 *   KEYCLOAK_ADMIN_USER         — admin-cli user w MASTER realmie
 *   KEYCLOAK_ADMIN_PASSWORD     — hasło tego usera
 *   MFA_REQUIRED_ACTION         — domyślnie CONFIGURE_TOTP (lub CONFIGURE_WEBAUTHN_2FA)
 *
 * Uruchomienie:
 *   KEYCLOAK_URL=… KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=… \
 *   node scripts/migrations/kc-enforce-mfa-for-admins.mjs
 */

const SUPERADMIN_ROLES = ["admin", "realm-admin", "manage-realm"];
const REQUIRED_ACTION = process.env.MFA_REQUIRED_ACTION ?? "CONFIGURE_TOTP";

function requireEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function adminToken({ url, user, password }) {
  const res = await fetch(`${url}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: user,
      password,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KC admin auth ${res.status}: ${body}`);
  }
  return (await res.json()).access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(`${process.env.KEYCLOAK_URL}/admin${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`KC API ${init.method ?? "GET"} ${path} ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main() {
  const url = requireEnv("KEYCLOAK_URL").replace(/\/$/, "");
  const realm = requireEnv("KEYCLOAK_REALM");
  const adminUser = requireEnv("KEYCLOAK_ADMIN_USER");
  const adminPassword = requireEnv("KEYCLOAK_ADMIN_PASSWORD");

  process.env.KEYCLOAK_URL = url;
  const token = await adminToken({ url, user: adminUser, password: adminPassword });

  const adminUserIds = new Set();
  for (const roleName of SUPERADMIN_ROLES) {
    try {
      const users = await api(
        token,
        `/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(roleName)}/users?max=10000`,
      );
      for (const u of users ?? []) adminUserIds.add(u.id);
    } catch (err) {
      console.warn(`[mfa-enforce] role ${roleName} lookup failed:`, err.message);
    }
  }

  console.log(`[mfa-enforce] found ${adminUserIds.size} privileged users`);

  let added = 0;
  let alreadyOk = 0;
  for (const userId of adminUserIds) {
    const u = await api(token, `/realms/${encodeURIComponent(realm)}/users/${userId}`);
    const required = Array.isArray(u.requiredActions) ? u.requiredActions : [];
    if (required.includes(REQUIRED_ACTION)) {
      alreadyOk++;
      continue;
    }
    const updated = { ...u, requiredActions: [...required, REQUIRED_ACTION] };
    await api(
      token,
      `/realms/${encodeURIComponent(realm)}/users/${userId}`,
      {
        method: "PUT",
        body: JSON.stringify(updated),
      },
    );
    added++;
    console.log(`[mfa-enforce] enforced ${REQUIRED_ACTION} for ${u.username} (${u.email ?? "no-email"})`);
  }

  console.log(`[mfa-enforce] DONE — added=${added}, already-enforced=${alreadyOk}`);
}

main().catch((err) => {
  console.error("[mfa-enforce] FAILED:", err);
  process.exit(1);
});

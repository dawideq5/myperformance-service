#!/usr/bin/env node
/**
 * Aplikuje security hardening na KC clients:
 *   - PKCE S256 wymagane (wszystkie clients, nawet confidential)
 *   - Implicit flow disabled (defense — był i tak false dla wszystkich)
 *   - Direct Access Grants (Resource Owner Password) disabled
 *   - Standard flow (auth code) explicit enabled
 *   - Service accounts only dla myperformance-service (client credentials)
 *
 * Idempotent. Skip system clients (account, broker, realm-management).
 */

const KC_BASE_URL = (process.env.KC_BASE_URL ?? "https://auth.myperformance.pl").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM ?? "MyPerformance";
const KC_USER = process.env.KC_BOOTSTRAP_USER ?? "admin";
const KC_PASSWORD = process.env.KC_BOOTSTRAP_PASSWORD;

if (!KC_PASSWORD) {
  console.error("KC_BOOTSTRAP_PASSWORD not set");
  process.exit(1);
}

const SYSTEM_CLIENTS = new Set([
  "account",
  "account-console",
  "admin-cli",
  "broker",
  "security-admin-console",
  "realm-management",
]);

async function getToken() {
  const r = await fetch(
    `${KC_BASE_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: KC_USER,
        password: KC_PASSWORD,
      }),
    },
  );
  if (!r.ok) throw new Error(`Auth: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function listClients(token) {
  const r = await fetch(
    `${KC_BASE_URL}/admin/realms/${KC_REALM}/clients`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return r.json();
}

async function patchClient(token, client) {
  const url = `${KC_BASE_URL}/admin/realms/${KC_REALM}/clients/${client.id}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(client),
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`PUT client ${client.clientId}: ${r.status} ${await r.text()}`);
  }
}

async function main() {
  console.log(`[apply-clients-hardening] ${KC_BASE_URL}/realms/${KC_REALM}`);
  const token = await getToken();
  const clients = await listClients(token);

  let patched = 0;
  for (const c of clients) {
    if (SYSTEM_CLIENTS.has(c.clientId)) continue;

    const before = JSON.stringify({
      attrs: c.attributes ?? {},
      implicit: c.implicitFlowEnabled,
      direct: c.directAccessGrantsEnabled,
      standard: c.standardFlowEnabled,
    });

    // Force PKCE S256 — chroni przed authorization code interception attack
    // (w tym confidential clients, gdzie code może wyciec przez logi proxy)
    c.attributes = c.attributes ?? {};
    c.attributes["pkce.code.challenge.method"] = "S256";

    // Disable implicit flow (deprecated, leak token w URL fragment)
    c.implicitFlowEnabled = false;

    // Disable Resource Owner Password Credentials (Direct Access Grants).
    // ROPC nie powinno być używane — brak MFA, leak credentials w app code.
    // Wyjątek: admin-cli (master realm tooling) — ale to system client.
    c.directAccessGrantsEnabled = false;

    // myperformance-service to client credentials grant ONLY (service account
    // do KC Admin API z dashboardu). Nie powinien mieć standard flow.
    if (c.clientId === "myperformance-service") {
      c.standardFlowEnabled = false;
      c.serviceAccountsEnabled = true;
    }

    // Wszystkie pozostałe confidential clients potrzebują standard auth-code
    // flow dla SSO login.
    if (c.clientId !== "myperformance-service" && c.publicClient !== true) {
      c.standardFlowEnabled = true;
    }

    const after = JSON.stringify({
      attrs: c.attributes,
      implicit: c.implicitFlowEnabled,
      direct: c.directAccessGrantsEnabled,
      standard: c.standardFlowEnabled,
    });

    if (before === after) {
      console.log(`· ${c.clientId} — already hardened`);
      continue;
    }

    await patchClient(token, c);
    patched++;
    console.log(`✓ ${c.clientId} — PKCE=S256, implicit=false, directGrant=false`);
  }

  console.log(`[apply-clients-hardening] Done. Patched ${patched} clients.`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(2);
});

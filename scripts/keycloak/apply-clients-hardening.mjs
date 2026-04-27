#!/usr/bin/env node
/**
 * OPCJONALNY skrypt — NIE uruchamiany automatycznie.
 *
 * Aplikuje konkretne KC client defaults. Admin sam decyduje kiedy.
 * Wymaga CONFIRM=yes — bez tego no-op.
 */

if (process.env.CONFIRM !== "yes") {
  console.error(
    "Ten skrypt nadpisuje konfigurację KC clients w live KC.\n" +
      "Aby kontynuować ustaw CONFIRM=yes:\n" +
      "  CONFIRM=yes KC_BOOTSTRAP_PASSWORD=... node scripts/keycloak/apply-clients-hardening.mjs",
  );
  process.exit(1);
}

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

    // PKCE S256 — TYLKO na public clients (bez client_secret) i NextAuth
    // (myperformance-dashboard wysyła PKCE auto). Ustawienie tego attribute
    // na confidential clients WYMUSZA PKCE, a większość OIDC pluginów
    // (Moodle/Outline/Documenso/Postal/Chatwoot/Wazuh/Directus) nie wysyła
    // code_challenge → KC odrzuca jako "invalid_request: Missing parameter:
    // code_challenge_method".
    //
    // Dla confidential clients PKCE jest opcjonalne — chronią je już:
    //   - client_secret (nie wycieknie przez URL/proxy logs)
    //   - exact-match redirect URI
    //   - HTTPS na całej trasie
    c.attributes = c.attributes ?? {};
    const isPublic = c.publicClient === true;
    const isDashboard = c.clientId === "myperformance-dashboard";
    if (isPublic || isDashboard) {
      c.attributes["pkce.code.challenge.method"] = "S256";
    } else {
      // Usuwamy attribute jeśli był ustawiony wcześniej — żeby Moodle/Outline
      // mogły logować się normalnie auth-code flow bez PKCE.
      delete c.attributes["pkce.code.challenge.method"];
    }

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

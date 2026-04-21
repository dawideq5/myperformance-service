#!/usr/bin/env node
/**
 * Configure Keycloak `stepca-oidc` client as confidential (required by step-ca
 * OIDC provisioner, which performs a server-side code exchange with
 * client_secret_post), capture its client secret, then return it.
 *
 * Output: single JSON object {clientId, secret} on stdout.
 *
 * Usage:
 *   KEYCLOAK_URL=https://auth.myperformance.pl \
 *   KEYCLOAK_REALM=MyPerformance \
 *   KEYCLOAK_ADMIN_USER=admin \
 *   KEYCLOAK_ADMIN_PASSWORD=... \
 *     node scripts/stepca-oidc-setup.mjs
 */
const KEYCLOAK_URL = requireEnv("KEYCLOAK_URL");
const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";

function requireEnv(n) {
  const v = process.env[n];
  if (!v) { console.error(`Missing ${n}`); process.exit(2); }
  return v;
}

async function adminToken() {
  const params = new URLSearchParams();
  params.set("grant_type", "password");
  params.set("client_id", "admin-cli");
  params.set("username", requireEnv("KEYCLOAK_ADMIN_USER"));
  params.set("password", requireEnv("KEYCLOAK_ADMIN_PASSWORD"));
  const res = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error(`admin token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function kc(path, token, init = {}) {
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

async function main() {
  const token = await adminToken();
  const list = await kc(`/clients?clientId=stepca-oidc`, token);
  const arr = await list.json();
  if (arr.length === 0) throw new Error("client stepca-oidc not found");
  const client = arr[0];

  const desired = {
    ...client,
    publicClient: false,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [
      "http://127.0.0.1/*",
      "http://localhost/*",
      // step-ca OIDC provisioner opens a local listener on a random port:
      "http://127.0.0.1:*",
      "http://localhost:*",
    ],
    attributes: {
      ...(client.attributes || {}),
      "pkce.code.challenge.method": "S256",
      "client.secret.creation.time": String(Math.floor(Date.now() / 1000)),
    },
  };

  const upd = await kc(`/clients/${client.id}`, token, {
    method: "PUT",
    body: JSON.stringify(desired),
  });
  if (!upd.ok) throw new Error(`update: ${upd.status} ${await upd.text()}`);

  // regenerate (or fetch) secret
  const sec = await kc(`/clients/${client.id}/client-secret`, token, { method: "POST" });
  if (!sec.ok) throw new Error(`secret: ${sec.status} ${await sec.text()}`);
  const { value } = await sec.json();
  console.log(JSON.stringify({ clientId: "stepca-oidc", secret: value }));
}

main().catch((e) => { console.error(e); process.exit(1); });

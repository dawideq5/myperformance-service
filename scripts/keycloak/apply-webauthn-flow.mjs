#!/usr/bin/env node
/**
 * Konfiguruje browser authentication flow w Keycloak żeby obsługiwał
 * WebAuthn Passwordless jako 2FA alternative do OTP po username+password.
 *
 * Strategia (zachowawcza):
 *   - NIE zmieniamy istniejącego "browser" flow który jest w użyciu jako
 *     domyślny (zmiana ryzykowna — user mógłby zostać zablokowany).
 *   - Tworzymy KOPIĘ "browser-webauthn" z dodanymi WebAuthn steps.
 *   - Admin sam ustawia "browser-webauthn" jako default w UI gdy gotowy.
 *
 * Po zaaplikowaniu w UI Admin Console:
 *   Realm Settings → Authentication → Bindings → Browser Flow →
 *     wybrać "browser-webauthn" → Save.
 *
 * Idempotent — re-run nadpisuje "browser-webauthn" flow.
 */

const KC_BASE_URL = (process.env.KC_BASE_URL ?? "https://auth.myperformance.pl").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM ?? "MyPerformance";
const KC_USER = process.env.KC_BOOTSTRAP_USER ?? "admin";
const KC_PASSWORD = process.env.KC_BOOTSTRAP_PASSWORD;
const NEW_FLOW_ALIAS = "browser-webauthn";

if (!KC_PASSWORD) {
  console.error("KC_BOOTSTRAP_PASSWORD not set");
  process.exit(1);
}

async function getToken() {
  const r = await fetch(`${KC_BASE_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KC_USER,
      password: KC_PASSWORD,
    }),
  });
  if (!r.ok) throw new Error(`Auth: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function api(token, path, init = {}) {
  const url = `${KC_BASE_URL}/admin/realms/${KC_REALM}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return r;
}

async function main() {
  console.log(`[apply-webauthn-flow] ${KC_BASE_URL}/realms/${KC_REALM}`);
  const token = await getToken();

  // Cleanup poprzedniej kopii jeśli istnieje (idempotent re-run)
  const existing = await api(token, `/authentication/flows`).then((r) => r.json());
  const old = existing.find((f) => f.alias === NEW_FLOW_ALIAS);
  if (old) {
    console.log(`· Removing existing ${NEW_FLOW_ALIAS} flow`);
    const del = await api(token, `/authentication/flows/${old.id}`, { method: "DELETE" });
    if (!del.ok && del.status !== 204) {
      console.error("Failed to delete old flow:", del.status, await del.text());
      process.exit(2);
    }
  }

  // Copy "browser" → "browser-webauthn"
  console.log(`✓ Copying browser flow → ${NEW_FLOW_ALIAS}`);
  const copyRes = await api(token, `/authentication/flows/browser/copy`, {
    method: "POST",
    body: JSON.stringify({ newName: NEW_FLOW_ALIAS }),
  });
  if (!copyRes.ok && copyRes.status !== 201) {
    console.error("Copy failed:", copyRes.status, await copyRes.text());
    process.exit(2);
  }

  // Find executions of new flow
  const executions = await api(
    token,
    `/authentication/flows/${NEW_FLOW_ALIAS}/executions`,
  ).then((r) => r.json());

  // Znajdujemy "forms" subflow (ten z Username/Password + Conditional OTP)
  const formsFlow = executions.find(
    (e) => e.displayName?.toLowerCase() === `${NEW_FLOW_ALIAS} forms` ||
           e.displayName?.toLowerCase() === "forms" ||
           e.displayName?.toLowerCase().endsWith(" forms"),
  );
  if (!formsFlow) {
    console.error("Could not find 'forms' subflow in new flow:");
    for (const e of executions) console.error(`  - ${e.displayName}`);
    process.exit(2);
  }
  console.log(`✓ Forms subflow found: ${formsFlow.displayName} (${formsFlow.flowId})`);

  // Add WebAuthn Passwordless Authenticator execution INSIDE forms subflow
  // Jako ALTERNATIVE — user może wybrać password+OTP albo username+passkey.
  console.log(`✓ Adding WebAuthn Passwordless Authenticator to ${formsFlow.displayName}`);
  const addRes = await api(
    token,
    `/authentication/flows/${encodeURIComponent(formsFlow.displayName)}/executions/execution`,
    {
      method: "POST",
      body: JSON.stringify({ provider: "webauthn-authenticator-passwordless" }),
    },
  );
  if (!addRes.ok && addRes.status !== 201) {
    console.error("Failed to add WebAuthn:", addRes.status, await addRes.text());
    process.exit(2);
  }

  // Set ALTERNATIVE requirement na nowo dodaną execution
  const updatedExecs = await api(
    token,
    `/authentication/flows/${encodeURIComponent(formsFlow.displayName)}/executions`,
  ).then((r) => r.json());
  const webauthnExec = updatedExecs.find(
    (e) => e.providerId === "webauthn-authenticator-passwordless",
  );
  if (webauthnExec) {
    webauthnExec.requirement = "ALTERNATIVE";
    await api(
      token,
      `/authentication/flows/${encodeURIComponent(formsFlow.displayName)}/executions`,
      { method: "PUT", body: JSON.stringify(webauthnExec) },
    );
    console.log(`✓ WebAuthn Passwordless set to ALTERNATIVE`);
  }

  console.log(`\n[apply-webauthn-flow] Done.`);
  console.log(`\nABY AKTYWOWAĆ:`);
  console.log(`  1. Otwórz ${KC_BASE_URL}/admin/master/console/`);
  console.log(`  2. Realm: MyPerformance → Authentication → Bindings`);
  console.log(`  3. Browser Flow: zmień na "${NEW_FLOW_ALIAS}" → Save`);
  console.log(`  4. Test login jako user z passkey — powinieneś dostać WebAuthn challenge.`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(2);
});

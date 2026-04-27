#!/usr/bin/env node
/**
 * Aplikuje security hardening na KC realm MyPerformance przez Admin API.
 * Zmiany muszą być zsynchronizowane z infrastructure/keycloak/realm.json —
 * realm.json jest source-of-truth, ten skrypt push-uje zmiany do live KC.
 *
 * Idempotent. Bez wymagań / argumentów. Czyta KC creds z env:
 *   KC_BASE_URL              (default https://auth.myperformance.pl)
 *   KC_BOOTSTRAP_USER        (default admin)
 *   KC_BOOTSTRAP_PASSWORD    (required)
 *   KC_REALM                 (default MyPerformance)
 *
 * Usage:
 *   KC_BOOTSTRAP_PASSWORD=... node scripts/keycloak/apply-realm-hardening.mjs
 */

const KC_BASE_URL = (process.env.KC_BASE_URL ?? "https://auth.myperformance.pl").replace(/\/$/, "");
const KC_REALM = process.env.KC_REALM ?? "MyPerformance";
const KC_USER = process.env.KC_BOOTSTRAP_USER ?? "admin";
const KC_PASSWORD = process.env.KC_BOOTSTRAP_PASSWORD;

if (!KC_PASSWORD) {
  console.error("KC_BOOTSTRAP_PASSWORD not set");
  process.exit(1);
}

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
  if (!r.ok) {
    throw new Error(`Auth failed: ${r.status} ${await r.text()}`);
  }
  const data = await r.json();
  return data.access_token;
}

async function patchRealm(token, patch) {
  const url = `${KC_BASE_URL}/admin/realms/${encodeURIComponent(KC_REALM)}`;
  // Zaczynamy od GET, żeby PATCH nie nadpisał innych pól (KC nie ma natywnego
  // PATCH — PUT na realm wymaga pełnego body). Mergujemy lokalnie.
  const cur = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!cur.ok) throw new Error(`GET realm: ${cur.status}`);
  const realm = await cur.json();
  const merged = { ...realm, ...patch };
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(merged),
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`PUT realm: ${r.status} ${await r.text()}`);
  }
}

async function findUser(token, username) {
  const url = `${KC_BASE_URL}/admin/realms/${encodeURIComponent(KC_REALM)}/users?username=${encodeURIComponent(username)}&exact=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const list = await r.json();
  return Array.isArray(list) && list[0] ? list[0] : null;
}

async function patchUser(token, userId, patch) {
  const url = `${KC_BASE_URL}/admin/realms/${encodeURIComponent(KC_REALM)}/users/${userId}`;
  const cur = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!cur.ok) throw new Error(`GET user: ${cur.status}`);
  const u = await cur.json();
  const merged = { ...u, ...patch };
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(merged),
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`PUT user: ${r.status} ${await r.text()}`);
  }
}

async function setEventsConfig(token) {
  const url = `${KC_BASE_URL}/admin/realms/${encodeURIComponent(KC_REALM)}/events/config`;
  const cur = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!cur.ok) throw new Error(`GET events/config: ${cur.status}`);
  const cfg = await cur.json();
  const merged = {
    ...cfg,
    eventsEnabled: true,
    eventsExpiration: 7776000,
    adminEventsEnabled: true,
    adminEventsDetailsEnabled: true,
  };
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(merged),
  });
  if (!r.ok && r.status !== 204) {
    throw new Error(`PUT events/config: ${r.status} ${await r.text()}`);
  }
}

async function main() {
  console.log(`[apply-realm-hardening] Target: ${KC_BASE_URL}/realms/${KC_REALM}`);
  const token = await getToken();
  console.log("✓ Got admin token");

  const realmPatch = {
    passwordPolicy:
      "length(16) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and notUsername(undefined) and notEmail(undefined) and passwordHistory(5) and forceExpiredPasswordChange(0)",
    revokeRefreshToken: true,
    refreshTokenMaxReuse: 0,
    offlineSessionMaxLifespanEnabled: true,
    offlineSessionMaxLifespan: 2592000,

    // WebAuthn standard (security key)
    webAuthnPolicyRpId: "myperformance.pl",
    webAuthnPolicyAttestationConveyancePreference: "none",
    webAuthnPolicyUserVerificationRequirement: "required",
    webAuthnPolicyCreateTimeout: 60,
    webAuthnPolicyAvoidSameAuthenticatorRegister: true,

    // WebAuthn passwordless (passkey)
    webAuthnPolicyPasswordlessRpId: "myperformance.pl",
    webAuthnPolicyPasswordlessAttestationConveyancePreference: "none",
    webAuthnPolicyPasswordlessAuthenticatorAttachment: "platform",
    webAuthnPolicyPasswordlessRequireResidentKey: "Yes",
    webAuthnPolicyPasswordlessUserVerificationRequirement: "required",
    webAuthnPolicyPasswordlessCreateTimeout: 60,
    webAuthnPolicyPasswordlessAvoidSameAuthenticatorRegister: true,

    browserSecurityHeaders: {
      contentSecurityPolicyReportOnly: "",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "no-referrer",
      xRobotsTag: "none",
      xFrameOptions: "DENY",
      contentSecurityPolicy:
        "frame-src 'self'; frame-ancestors 'none'; object-src 'none';",
      xXSSProtection: "1; mode=block",
      strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    },
  };

  await patchRealm(token, realmPatch);
  console.log("✓ Realm settings updated (password policy, webAuthn, browser headers, refresh rotation)");

  await setEventsConfig(token);
  console.log("✓ Events config updated (eventsExpiration=90d, adminEvents enabled)");

  // Admin user: forceuje UPDATE_PASSWORD przy następnym loginie + CONFIGURE_TOTP.
  // Jeśli user jeszcze nie ustawił MFA, mfa-enforcer to wymusi po cyklu, ale
  // tu robimy explicit dla zerowego stanu (świeży import realm.json).
  const adminUser = await findUser(token, "admin");
  if (adminUser?.id) {
    const requiredActions = Array.from(
      new Set([...(adminUser.requiredActions ?? []), "UPDATE_PASSWORD", "CONFIGURE_TOTP"]),
    );
    await patchUser(token, adminUser.id, { requiredActions });
    console.log(`✓ Admin user requiredActions updated: ${requiredActions.join(",")}`);
  } else {
    console.log("· admin user not found in realm — skipping requiredActions");
  }

  console.log("[apply-realm-hardening] Done.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(2);
});

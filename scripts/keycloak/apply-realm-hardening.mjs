#!/usr/bin/env node
/**
 * OPCJONALNY skrypt — NIE uruchamiany automatycznie.
 *
 * Aplikuje konkretne security defaults na KC realm. Admin sam decyduje
 * kiedy go uruchomić (np. po świeżym imporcie realm.json). Wszystkie
 * settings można też ustawić ręcznie w KC Admin Console (Realm Settings →
 * Sessions / Tokens / Headers / WebAuthn Policy).
 *
 * Wymaga eksplicitnego CONFIRM=yes żeby uniknąć przypadkowego uruchomienia
 * i nadpisania manualnych zmian admina.
 *
 * Czyta KC creds z env:
 *   KC_BASE_URL              (default https://auth.myperformance.pl)
 *   KC_BOOTSTRAP_USER        (default admin)
 *   KC_BOOTSTRAP_PASSWORD    (required)
 *   KC_REALM                 (default MyPerformance)
 *   CONFIRM=yes              (required — explicit opt-in)
 *
 * Usage:
 *   CONFIRM=yes KC_BOOTSTRAP_PASSWORD=... node scripts/keycloak/apply-realm-hardening.mjs
 */

if (process.env.CONFIRM !== "yes") {
  console.error(
    "Ten skrypt nadpisuje konfigurację realm w live KC.\n" +
      "Aby kontynuować ustaw CONFIRM=yes:\n" +
      "  CONFIRM=yes KC_BOOTSTRAP_PASSWORD=... node scripts/keycloak/apply-realm-hardening.mjs",
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
    // passwordPolicy NIE jest tutaj — admin zarządza w Keycloak Admin Console
    // (Realm Settings → Authentication → Password Policy). Skrypt nie dotyka
    // tego pola, żeby nie nadpisywać manualnych zmian admina.
    //
    // revokeRefreshToken=true (token rotation) generował race conditions
    // w przypadku parallel requestów dashboardu (notifications poll +
    // user fetch + sightings) — pierwszy zżerał refresh token, kolejne
    // dostawały invalid_grant → middleware logout cascade → user wyrzucany
    // do /api/auth/logout. KC default (false, 1 token przez całą sesję)
    // jest pragmatyczny w tym setup. Refresh expiry chroni Z OFFLINE max
    // lifespan (30d) + bruteForceProtection.
    revokeRefreshToken: false,
    refreshTokenMaxReuse: 0,
    // Token + session hardening:
    //   - access 5min: krótkie okno gdy skradziony token jest użyteczny
    //   - SSO session max 8h: wymusza re-login po dniu pracy (był 24h)
    //   - SSO idle 4h: zamyka pozostawione zalogowane sesje
    //   - offline session 30d: refresh token max lifespan (privileged
    //     account compromise — atakujący ma 30d windowing przed forced
    //     re-login). NIST SP 800-63B AAL2 dopuszcza do 30d dla refresh.
    accessTokenLifespan: 300,
    ssoSessionIdleTimeout: 14400,
    ssoSessionMaxLifespan: 28800,
    offlineSessionIdleTimeout: 2592000,
    offlineSessionMaxLifespanEnabled: true,
    offlineSessionMaxLifespan: 2592000,

    // WebAuthn — patchujemy TYLKO RpId (krytyczne dla działania subdomain
    // logowania, bez tego WebAuthn rejection na Safari). Resztę (UV,
    // attachment, attestation, residentKey) zostawiamy adminowi w UI.
    webAuthnPolicyRpId: "myperformance.pl",
    webAuthnPolicyPasswordlessRpId: "myperformance.pl",

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

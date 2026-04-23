#!/usr/bin/env node
/**
 * Propagate Postal SMTP credentials to every Coolify-managed service that
 * sends mail. Per service we upsert the *expected* env keys (different apps
 * use different prefixes — see the mapping below), then trigger a redeploy.
 *
 * ENV required:
 *   COOLIFY_BASE_URL     e.g. https://coolify.myperformance.pl
 *   COOLIFY_API_TOKEN    Coolify API token with admin scope
 *   POSTAL_INTERNAL_SMTP_HOST   e.g. smtp-iut9wf1rz9ey54g7lbkje0je
 *   POSTAL_INTERNAL_SMTP_PORT   e.g. 25
 *   POSTAL_INTERNAL_SMTP_USER   Postal credential username (server permalink)
 *   POSTAL_INTERNAL_SMTP_PASS   Postal credential key
 *   POSTAL_SMTP_FROM            e.g. "MyPerformance <noreply@myperformance.pl>"
 *   POSTAL_SMTP_SECURE          "false" — inside docker we run plain port 25
 *
 * Optional ENV: comma-separated list of services to limit (default: all)
 *   POSTAL_TARGETS=dashboard,directus,chatwoot,...
 *
 * Coolify v4 quirks:
 *   - POST /envs does NOT upsert. We query existing envs, DELETE the old,
 *     POST the new. (See feedback_coolify_env_api memory.)
 *   - services-nested apps (chatwoot, directus, postal itself) require
 *     the service UUID in the path `/services/{uuid}/envs`, application
 *     UUIDs (dashboard, documenso, outline, moodle, keycloak) go to
 *     `/applications/{uuid}/envs`.
 */

import process from "node:process";

const required = (name) => {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`missing env: ${name}`);
    process.exit(1);
  }
  return v;
};

const COOLIFY_BASE_URL = required("COOLIFY_BASE_URL").replace(/\/$/, "");
const COOLIFY_API_TOKEN = required("COOLIFY_API_TOKEN");
const HOST = required("POSTAL_INTERNAL_SMTP_HOST");
const PORT = process.env.POSTAL_INTERNAL_SMTP_PORT || "25";
const USER = required("POSTAL_INTERNAL_SMTP_USER");
const PASS = required("POSTAL_INTERNAL_SMTP_PASS");
const FROM = process.env.POSTAL_SMTP_FROM || "noreply@myperformance.pl";
const SECURE = (process.env.POSTAL_SMTP_SECURE || "false").toLowerCase();

const BEARER = { Authorization: `Bearer ${COOLIFY_API_TOKEN}` };
const JSON_HEADERS = { ...BEARER, "Content-Type": "application/json" };

/**
 * Service catalog. `kind` determines the API base path:
 *   - "application" → /api/v1/applications/{uuid}/envs
 *   - "service"     → /api/v1/services/{uuid}/envs
 *
 * `envs` is a mapping of prefix-specific keys → logical value. We assemble
 * the payload per-service below so each app gets credentials in the exact
 * key names it expects.
 */
const SERVICES = [
  {
    name: "dashboard",
    uuid: process.env.COOLIFY_DASHBOARD_UUID,
    kind: "application",
    keys: {
      SMTP_HOST: HOST,
      SMTP_PORT: PORT,
      SMTP_USER: USER,
      SMTP_PASSWORD: PASS,
      SMTP_SECURE: SECURE,
      CERT_EMAIL_FROM_ADDRESS: "noreply@myperformance.pl",
      CERT_EMAIL_FROM_NAME: "MyPerformance",
    },
  },
  {
    name: "documenso",
    uuid: process.env.COOLIFY_DOCUMENSO_UUID,
    kind: "application",
    keys: {
      NEXT_PRIVATE_SMTP_TRANSPORT: "smtp-auth",
      NEXT_PRIVATE_SMTP_HOST: HOST,
      NEXT_PRIVATE_SMTP_PORT: PORT,
      NEXT_PRIVATE_SMTP_USERNAME: USER,
      NEXT_PRIVATE_SMTP_PASSWORD: PASS,
      NEXT_PRIVATE_SMTP_SECURE: SECURE,
      NEXT_PRIVATE_SMTP_FROM_ADDRESS: "noreply@myperformance.pl",
      NEXT_PRIVATE_SMTP_FROM_NAME: "Documenso",
    },
  },
  {
    name: "chatwoot",
    uuid: process.env.COOLIFY_CHATWOOT_UUID,
    kind: "service",
    keys: {
      SMTP_ADDRESS: HOST,
      SMTP_PORT: PORT,
      SMTP_USERNAME: USER,
      SMTP_PASSWORD: PASS,
      SMTP_AUTHENTICATION: "login",
      SMTP_ENABLE_STARTTLS_AUTO: "false",
      SMTP_DOMAIN: "myperformance.pl",
      MAILER_SENDER_EMAIL: FROM,
      SMTP_OPENSSL_VERIFY_MODE: "none",
    },
  },
  {
    name: "directus",
    uuid: process.env.COOLIFY_DIRECTUS_UUID,
    kind: "service",
    keys: {
      EMAIL_TRANSPORT: "smtp",
      EMAIL_SMTP_HOST: HOST,
      EMAIL_SMTP_PORT: PORT,
      EMAIL_SMTP_USER: USER,
      EMAIL_SMTP_PASSWORD: PASS,
      EMAIL_SMTP_SECURE: SECURE,
      EMAIL_SMTP_IGNORE_TLS: SECURE === "false" ? "true" : "false",
      EMAIL_FROM: FROM,
    },
  },
  {
    name: "outline",
    uuid: process.env.COOLIFY_OUTLINE_UUID,
    kind: "application",
    keys: {
      SMTP_HOST: HOST,
      SMTP_PORT: PORT,
      SMTP_USERNAME: USER,
      SMTP_PASSWORD: PASS,
      SMTP_SECURE: SECURE,
      SMTP_FROM_EMAIL: "noreply@myperformance.pl",
      SMTP_REPLY_EMAIL: "noreply@myperformance.pl",
    },
  },
  {
    name: "moodle",
    uuid: process.env.COOLIFY_MOODLE_UUID,
    kind: "service",
    keys: {
      MOODLE_SMTP_HOST: HOST,
      MOODLE_SMTP_PORT: PORT,
      MOODLE_SMTP_USER: USER,
      MOODLE_SMTP_PASSWORD: PASS,
      MOODLE_SMTP_PROTOCOL: SECURE === "true" ? "ssl" : "none",
      MOODLE_EMAIL_FROM_NAME: "MyPerformance",
      MOODLE_EMAIL: "noreply@myperformance.pl",
    },
  },
  {
    name: "listmonk",
    uuid: process.env.COOLIFY_LISTMONK_UUID,
    kind: "service",
    keys: {
      LISTMONK_smtp__host: HOST,
      LISTMONK_smtp__port: PORT,
      LISTMONK_smtp__username: USER,
      LISTMONK_smtp__password: PASS,
      LISTMONK_smtp__tls_type: SECURE === "true" ? "STARTTLS" : "none",
      LISTMONK_smtp__from_email: FROM,
    },
  },
];

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const summary =
      typeof body === "object" && body?.message ? body.message : text;
    throw new Error(`${res.status} ${res.statusText}: ${summary}`);
  }
  return body;
}

async function listEnvs(kind, uuid) {
  const base = kind === "application" ? "applications" : "services";
  return fetchJson(`${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs`);
}

async function deleteEnv(kind, uuid, id) {
  const base = kind === "application" ? "applications" : "services";
  await fetchJson(
    `${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs/${id}`,
    { method: "DELETE" },
  );
}

async function createEnv(kind, uuid, key, value) {
  const base = kind === "application" ? "applications" : "services";
  await fetchJson(`${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      is_preview: false,
      is_build_time: false,
      is_literal: true,
    }),
  });
}

async function upsertEnv(kind, uuid, key, value) {
  // "POST /envs nie upsertuje" — find existing + delete + re-create.
  const list = await listEnvs(kind, uuid).catch(() => []);
  const existing = Array.isArray(list)
    ? list.find((e) => e.key === key)
    : null;
  if (existing?.id) {
    if (String(existing.value) === String(value)) return "noop";
    await deleteEnv(kind, uuid, existing.id);
  }
  await createEnv(kind, uuid, key, value);
  return existing?.id ? "updated" : "created";
}

async function deploy(kind, uuid) {
  const url = `${COOLIFY_BASE_URL}/api/v1/deploy?uuid=${uuid}&force=0`;
  await fetchJson(url, { method: "GET" });
}

const target = (process.env.POSTAL_TARGETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const results = [];
for (const svc of SERVICES) {
  if (target.length > 0 && !target.includes(svc.name)) continue;
  if (!svc.uuid) {
    results.push({ name: svc.name, status: "skip", reason: "no UUID" });
    continue;
  }
  try {
    for (const [key, value] of Object.entries(svc.keys)) {
      const action = await upsertEnv(svc.kind, svc.uuid, key, value);
      console.log(`[${svc.name}] ${action}: ${key}`);
    }
    if (process.env.POSTAL_REDEPLOY === "1") {
      await deploy(svc.kind, svc.uuid);
      console.log(`[${svc.name}] redeploy queued`);
    }
    results.push({ name: svc.name, status: "ok" });
  } catch (err) {
    results.push({
      name: svc.name,
      status: "fail",
      error: err instanceof Error ? err.message : String(err),
    });
    console.error(`[${svc.name}] FAILED: ${err}`);
  }
}

// Keycloak realm SMTP is configured via Admin API (not Coolify envs) because
// the settings live inside the realm record, not as container env vars.
if (
  !target.length ||
  target.includes("keycloak")
) {
  const kcUrl = process.env.KEYCLOAK_URL?.replace(/\/$/, "");
  const kcRealm = process.env.KEYCLOAK_REALM || "MyPerformance";
  const kcClientId =
    process.env.KEYCLOAK_SERVICE_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID;
  const kcSecret =
    process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ||
    process.env.KEYCLOAK_CLIENT_SECRET;
  if (kcUrl && kcClientId && kcSecret) {
    try {
      const tok = await fetch(
        `${kcUrl}/realms/${kcRealm}/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: kcClientId,
            client_secret: kcSecret,
          }),
        },
      );
      const tokBody = await tok.json();
      const adminToken = tokBody.access_token;
      if (!adminToken) throw new Error("no access_token");

      const getRealm = await fetch(
        `${kcUrl}/admin/realms/${kcRealm}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (!getRealm.ok) throw new Error(`realm GET ${getRealm.status}`);
      const realmData = await getRealm.json();

      const newSmtp = {
        ...(realmData.smtpServer || {}),
        host: HOST,
        port: PORT,
        from: "noreply@myperformance.pl",
        fromDisplayName: "MyPerformance",
        replyTo: "noreply@myperformance.pl",
        replyToDisplayName: "MyPerformance",
        auth: "true",
        user: USER,
        password: PASS,
        ssl: SECURE === "true" ? "true" : "false",
        starttls: SECURE === "true" ? "false" : "false",
      };

      const putRes = await fetch(`${kcUrl}/admin/realms/${kcRealm}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...realmData, smtpServer: newSmtp }),
      });
      if (!putRes.ok) throw new Error(`realm PUT ${putRes.status}`);
      console.log("[keycloak] realm smtpServer updated");
      results.push({ name: "keycloak", status: "ok" });
    } catch (err) {
      results.push({
        name: "keycloak",
        status: "fail",
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[keycloak] FAILED: ${err}`);
    }
  } else {
    results.push({
      name: "keycloak",
      status: "skip",
      reason: "KEYCLOAK_* envs missing",
    });
  }
}

console.log("\nsummary:");
for (const r of results) {
  console.log(`  ${r.name.padEnd(12)} ${r.status}${r.reason ? ` (${r.reason})` : ""}${r.error ? ` — ${r.error}` : ""}`);
}
const hasFail = results.some((r) => r.status === "fail");
process.exit(hasFail ? 1 : 0);

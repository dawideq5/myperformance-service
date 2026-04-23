#!/usr/bin/env node
/**
 * Synchronizacja KC client secrets → Coolify envs dla wszystkich aplikacji
 * OIDC (Outline, Directus, Documenso, Postal). Moodle pominięte — auth_oidc
 * trzyma secret w DB pluginu, nie env.
 *
 * Tryb idempotentny — porównuje aktualny env w Coolify z sekretem KC i
 * upsertuje tylko gdy się różnią.
 *
 * ENV wymagane:
 *   KEYCLOAK_URL + KEYCLOAK_REALM
 *   KEYCLOAK_SERVICE_CLIENT_ID + KEYCLOAK_SERVICE_CLIENT_SECRET (lub _CLIENT_*)
 *   COOLIFY_BASE_URL + COOLIFY_API_TOKEN
 *   COOLIFY_{OUTLINE,DIRECTUS,DOCUMENSO,POSTAL}_UUID — UUID każdego serwisu
 *
 * ENV opcjonalne:
 *   IAM_TARGETS=outline,directus       domyślnie: wszystkie
 *   IAM_REDEPLOY=1                     redeploy kontenerów po zmianie
 *   IAM_DRY_RUN=1                      tylko raport, nic nie zmienia
 *
 * Wynik: lista akcji per-serwis (created/updated/noop/fail) + (jeśli redeploy)
 * trigger deploy do Coolify.
 */

import process from "node:process";

const required = (name) => {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
};

const KC_URL = required("KEYCLOAK_URL").replace(/\/$/, "");
const KC_REALM = process.env.KEYCLOAK_REALM || "MyPerformance";
const KC_CLIENT_ID =
  process.env.KEYCLOAK_SERVICE_CLIENT_ID || required("KEYCLOAK_CLIENT_ID");
const KC_CLIENT_SECRET =
  process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ||
  required("KEYCLOAK_CLIENT_SECRET");
const COOLIFY_BASE_URL = required("COOLIFY_BASE_URL").replace(/\/$/, "");
const COOLIFY_API_TOKEN = required("COOLIFY_API_TOKEN");

const DRY_RUN = process.env.IAM_DRY_RUN === "1";
const DO_REDEPLOY = process.env.IAM_REDEPLOY === "1";

const TARGETS = (process.env.IAM_TARGETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Mapowanie: KC clientId → (Coolify app/service + env key).
// Moodle auth_oidc trzyma secret w DB, nie w env — pomijamy tu.
const MAPPING = [
  {
    name: "outline",
    kcClientId: "outline",
    coolifyUuidEnv: "COOLIFY_OUTLINE_UUID",
    coolifyKind: "service",
    envKey: "OUTLINE_OIDC_CLIENT_SECRET",
  },
  {
    name: "directus",
    kcClientId: "directus",
    coolifyUuidEnv: "COOLIFY_DIRECTUS_UUID",
    coolifyKind: "service",
    envKey: "AUTH_KEYCLOAK_CLIENT_SECRET",
  },
  {
    name: "documenso",
    kcClientId: "documenso",
    coolifyUuidEnv: "COOLIFY_DOCUMENSO_UUID",
    coolifyKind: "service",
    envKey: "NEXT_PRIVATE_OIDC_CLIENT_SECRET",
  },
  {
    name: "postal",
    kcClientId: "postal",
    coolifyUuidEnv: "COOLIFY_POSTAL_UUID",
    coolifyKind: "service",
    envKey: "POSTAL_OIDC_CLIENT_SECRET",
  },
];

// ---------- Keycloak helpers ----------

let adminToken = null;
async function getAdminToken() {
  if (adminToken) return adminToken;
  const res = await fetch(
    `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: KC_CLIENT_ID,
        client_secret: KC_CLIENT_SECRET,
      }),
    },
  );
  if (!res.ok) throw new Error(`admin token: ${res.status}`);
  const body = await res.json();
  adminToken = body.access_token;
  if (!adminToken) throw new Error("no access_token in body");
  return adminToken;
}

async function kc(path, init = {}) {
  const token = await getAdminToken();
  return fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function getKcClientSecret(kcClientId) {
  const list = await kc(`/clients?clientId=${encodeURIComponent(kcClientId)}`);
  if (!list.ok) throw new Error(`KC list ${kcClientId}: ${list.status}`);
  const arr = await list.json();
  if (!arr.length) throw new Error(`KC client ${kcClientId} not found`);
  const id = arr[0].id;
  const sec = await kc(`/clients/${id}/client-secret`);
  if (!sec.ok) throw new Error(`KC secret ${kcClientId}: ${sec.status}`);
  const secBody = await sec.json();
  if (!secBody.value) {
    // Regeneruj jeśli pusty.
    const regen = await kc(`/clients/${id}/client-secret`, { method: "POST" });
    if (!regen.ok) throw new Error(`KC regen ${kcClientId}: ${regen.status}`);
    const regenBody = await regen.json();
    return regenBody.value;
  }
  return secBody.value;
}

// ---------- Coolify helpers ----------

const BEARER = { Authorization: `Bearer ${COOLIFY_API_TOKEN}` };
const JSON_HEADERS = { ...BEARER, "Content-Type": "application/json" };

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.message ?? text;
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return body;
}

async function listEnvs(kind, uuid) {
  const base = kind === "application" ? "applications" : "services";
  return fetchJson(`${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs`);
}

async function patchEnv(kind, uuid, key, value) {
  // Coolify v4.0.0-beta.473+ wymusza PATCH po key (body) zamiast DELETE+POST
  // po id. Zwraca 409 gdy próbujesz POST-ować istniejący klucz.
  const base = kind === "application" ? "applications" : "services";
  await fetchJson(`${COOLIFY_BASE_URL}/api/v1/${base}/${uuid}/envs`, {
    method: "PATCH",
    body: JSON.stringify({
      key,
      value,
      is_preview: false,
      is_build_time: false,
      is_literal: true,
    }),
  });
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
  const envs = await listEnvs(kind, uuid).catch(() => []);
  const existing = Array.isArray(envs) ? envs.find((e) => e.key === key) : null;
  if (existing && String(existing.value) === String(value)) return "noop";
  if (DRY_RUN) return existing ? "would-update" : "would-create";
  if (existing) {
    await patchEnv(kind, uuid, key, value);
    return "updated";
  }
  await createEnv(kind, uuid, key, value);
  return "created";
}

async function redeploy(uuid) {
  if (DRY_RUN) return "would-redeploy";
  await fetchJson(
    `${COOLIFY_BASE_URL}/api/v1/deploy?uuid=${uuid}&force=0`,
    { method: "GET" },
  );
  return "redeploy-queued";
}

// ---------- Main loop ----------

const results = [];
for (const spec of MAPPING) {
  if (TARGETS.length && !TARGETS.includes(spec.name)) continue;
  const uuid = process.env[spec.coolifyUuidEnv];
  if (!uuid) {
    results.push({ name: spec.name, status: "skip", reason: `no ${spec.coolifyUuidEnv}` });
    continue;
  }
  try {
    const secret = await getKcClientSecret(spec.kcClientId);
    const action = await upsertEnv(spec.coolifyKind, uuid, spec.envKey, secret);
    let deployAction = null;
    if (DO_REDEPLOY && action !== "noop") {
      deployAction = await redeploy(uuid);
    }
    results.push({ name: spec.name, status: action, deploy: deployAction });
    console.log(
      `[${spec.name}] ${action}${deployAction ? ` + ${deployAction}` : ""}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name: spec.name, status: "fail", error: msg });
    console.error(`[${spec.name}] FAILED: ${msg}`);
  }
}

console.log("\nsummary:");
for (const r of results) {
  const suffix = r.reason
    ? ` (${r.reason})`
    : r.error
      ? ` — ${r.error}`
      : r.deploy
        ? ` ${r.deploy}`
        : "";
  console.log(`  ${r.name.padEnd(12)} ${r.status}${suffix}`);
}

const fail = results.some((r) => r.status === "fail");
process.exit(fail ? 1 : 0);

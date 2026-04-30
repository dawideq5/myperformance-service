#!/usr/bin/env node
/**
 * OVH API key rotation — interactive
 * ===================================
 *
 * Uruchom raz na ~6 mies. lub gdy current set może być compromised.
 *
 * Workflow:
 *
 *   1. Validate **current** creds przez `GET /me` (sanity).
 *   2. Request consumer key dla **NEW** app key/secret przez
 *      `POST /auth/credential` z permission rules potrzebnymi przez
 *      dashboard (DNS read+write, /me, /domain/*).
 *   3. Print **validation URL** i waituj na user-input — admin musi otworzyć
 *      URL w przeglądarce, zalogować się jako OVH account owner i
 *      potwierdzić app.
 *   4. Po naciśnięciu Enter: re-validate przez `GET /me` z nowymi creds.
 *      Jeśli OVH zwróci 403 → admin nie zaaprobował, abort.
 *   5. Update Coolify env dashboardu (`OVH_APP_KEY`, `OVH_APP_SECRET`,
 *      `OVH_CONSUMER_KEY`).
 *   6. Trigger redeploy dashboardu w Coolify.
 *   7. Wait + curl `/api/health` z nowych creds — verify że dashboard
 *      poprawnie startuje.
 *
 * Idempotentny gdzie możliwe — krok 1 i 4 to read-only, krok 5 upsert.
 * Krok 2 tworzy nowy consumer key (nie idempotent — każde uruchomienie
 * generuje nowy CK; stare należy ręcznie zinwalidować w
 * https://api.ovh.com/console).
 *
 * Fail-closed: każdy non-zero exit zatrzymuje pipeline; nigdy nie
 * pozostawia Coolify w mid-state (env się aktualizuje **dopiero** po
 * udanej re-validation w kroku 4).
 *
 * ENV wymagane:
 *
 *   OVH_APP_KEY              — current set (do GET /me sanity)
 *   OVH_APP_SECRET
 *   OVH_CONSUMER_KEY
 *   OVH_NEW_APP_KEY          — new set (świeżo wygenerowany w eu.api.ovh.com/createApp)
 *   OVH_NEW_APP_SECRET
 *   OVH_ENDPOINT             — domyślnie "ovh-eu"
 *   COOLIFY_BASE_URL         — np. https://coolify.myperformance.pl
 *   COOLIFY_API_TOKEN
 *   COOLIFY_DASHBOARD_UUID   — UUID dashboardu w Coolify
 *
 * ENV opcjonalne:
 *
 *   OVH_ROTATE_DRY_RUN=1     — tylko raport, brak zmian
 *   DASHBOARD_HEALTH_URL     — dom. https://myperformance.pl/api/health
 *
 * Manual steps przed uruchomieniem:
 *   - W https://eu.api.ovh.com/createApp utwórz nową appkę (notuj appKey + appSecret)
 *   - Eksportuj envy powyżej (zalecane: do `~/.ovh-rotate.env`, source przed run)
 *
 * Uruchom:
 *   node scripts/ovh-rotate-keys.mjs
 *
 * Po sukcesie:
 *   - Zinwaliduj **stary** consumer key w https://eu.api.ovh.com/console
 *     (Application → expire). Skrypt tego nie robi by zachować rollback window.
 */

import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import process from "node:process";

// ---------- env ----------

function required(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`ERROR: missing env: ${name}`);
    process.exit(2);
  }
  return v;
}

function optional(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

const DRY_RUN = optional("OVH_ROTATE_DRY_RUN") === "1";

const CURRENT = {
  endpoint: optional("OVH_ENDPOINT", "ovh-eu"),
  appKey: required("OVH_APP_KEY"),
  appSecret: required("OVH_APP_SECRET"),
  consumerKey: required("OVH_CONSUMER_KEY"),
};
const NEW_APP_KEY = required("OVH_NEW_APP_KEY");
const NEW_APP_SECRET = required("OVH_NEW_APP_SECRET");

const COOLIFY_BASE_URL = required("COOLIFY_BASE_URL").replace(/\/$/, "");
const COOLIFY_API_TOKEN = required("COOLIFY_API_TOKEN");
const COOLIFY_DASHBOARD_UUID = required("COOLIFY_DASHBOARD_UUID");

const HEALTH_URL = optional(
  "DASHBOARD_HEALTH_URL",
  "https://myperformance.pl/api/health",
);

// ---------- OVH client (HMAC-SHA1 signing) ----------

const ENDPOINT_BASE = {
  "ovh-eu": "https://eu.api.ovh.com/1.0",
  "ovh-us": "https://api.us.ovhcloud.com/1.0",
  "ovh-ca": "https://ca.api.ovh.com/1.0",
};

function endpointBase(endpoint) {
  const url = ENDPOINT_BASE[endpoint];
  if (!url) {
    throw new Error(`unknown OVH_ENDPOINT: ${endpoint}`);
  }
  return url;
}

async function ovhTime(endpoint) {
  const res = await fetch(`${endpointBase(endpoint)}/auth/time`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OVH /auth/time: ${res.status}`);
  return parseInt(await res.text(), 10);
}

function ovhSign({ secret, consumer, method, url, body, ts }) {
  const input = `${secret}+${consumer}+${method}+${url}+${body}+${ts}`;
  return `$1$${createHash("sha1").update(input).digest("hex")}`;
}

async function ovh(creds, method, path, body) {
  const url = `${endpointBase(creds.endpoint)}${path}`;
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const ts = await ovhTime(creds.endpoint);
  const signature = ovhSign({
    secret: creds.appSecret,
    consumer: creds.consumerKey ?? "",
    method,
    url,
    body: bodyStr,
    ts,
  });
  const headers = {
    "X-Ovh-Application": creds.appKey,
    "X-Ovh-Timestamp": String(ts),
    "X-Ovh-Signature": signature,
  };
  if (creds.consumerKey) headers["X-Ovh-Consumer"] = creds.consumerKey;
  if (bodyStr) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------- helpers ----------

async function ask(prompt) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function fetchCoolify(path, init = {}) {
  const res = await fetch(`${COOLIFY_BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${COOLIFY_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Coolify ${init.method ?? "GET"} ${path}: ${res.status} ${
        body?.message ?? text
      }`,
    );
  }
  return body;
}

async function upsertCoolifyEnv(uuid, key, value) {
  // Per scripts/iam-sync-oidc-secrets.mjs: lista envów + PATCH gdy istnieje,
  // POST gdy nie. Coolify v4 wymusza PATCH po key.
  const envs = await fetchCoolify(`/applications/${uuid}/envs`).catch(() => []);
  const list = Array.isArray(envs) ? envs : [];
  const existing = list.find((e) => e.key === key);
  if (existing && String(existing.value) === String(value)) return "noop";
  if (DRY_RUN) return existing ? "would-update" : "would-create";
  const payload = {
    key,
    value,
    is_preview: false,
    is_build_time: false,
    is_literal: true,
  };
  if (existing) {
    await fetchCoolify(`/applications/${uuid}/envs`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return "updated";
  }
  await fetchCoolify(`/applications/${uuid}/envs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return "created";
}

async function redeployDashboard(uuid) {
  if (DRY_RUN) return "would-redeploy";
  await fetchCoolify(`/deploy?uuid=${uuid}&force=0`, { method: "GET" });
  return "redeploy-queued";
}

// Permission rules wymagane przez dashboard. Wartości muszą się zgadzać z
// faktycznymi operacjami w lib/email/ovh.ts (DNS write + read profile).
const PERMISSION_RULES = [
  { method: "GET", path: "/me" },
  { method: "GET", path: "/domain/zone/*" },
  { method: "GET", path: "/domain/zone/*/record" },
  { method: "POST", path: "/domain/zone/*/record" },
  { method: "DELETE", path: "/domain/zone/*/record/*" },
  { method: "POST", path: "/domain/zone/*/refresh" },
];

// ---------- workflow ----------

async function step1ValidateCurrent() {
  console.log("[1/7] Validate CURRENT creds (GET /me)…");
  const res = await ovh(CURRENT, "GET", "/me");
  if (!res.ok) {
    console.error(`  FAIL: ${res.status} ${JSON.stringify(res.data)}`);
    console.error(
      "  Sanity check failed — current creds nie działają. Abort.",
    );
    process.exit(1);
  }
  const me = res.data;
  console.log(
    `  OK — nic: ${me.nichandle ?? "?"}, email: ${me.email ?? "?"}, country: ${
      me.country ?? "?"
    }`,
  );
}

async function step2RequestNewConsumerKey() {
  console.log("[2/7] Request consumer key dla NEW app…");
  if (DRY_RUN) {
    console.log("  DRY_RUN: would POST /auth/credential");
    return { consumerKey: "ck-dry-run", validationUrl: "https://example/validate" };
  }
  const res = await ovh(
    {
      endpoint: CURRENT.endpoint,
      appKey: NEW_APP_KEY,
      appSecret: NEW_APP_SECRET,
      consumerKey: "", // brak — request CK to pierwsze użycie
    },
    "POST",
    "/auth/credential",
    { accessRules: PERMISSION_RULES, redirection: "" },
  );
  if (!res.ok) {
    console.error(`  FAIL: ${res.status} ${JSON.stringify(res.data)}`);
    process.exit(1);
  }
  const { consumerKey, validationUrl } = res.data;
  if (!consumerKey || !validationUrl) {
    console.error(`  FAIL: brak consumerKey/validationUrl: ${JSON.stringify(res.data)}`);
    process.exit(1);
  }
  console.log(`  OK — consumerKey: ${consumerKey.slice(0, 8)}…`);
  return { consumerKey, validationUrl };
}

async function step3WaitForUserApproval(validationUrl) {
  console.log("[3/7] Approve w OVH UI:");
  console.log(`\n    ${validationUrl}\n`);
  console.log(
    "  Otwórz URL w przeglądarce, zaloguj się jako OVH account owner",
  );
  console.log("  i kliknij 'Authorize'.");
  await ask("  Naciśnij Enter gdy zaaprobowane (lub Ctrl-C aby przerwać): ");
}

async function step4ValidateNewCreds(newConsumerKey) {
  console.log("[4/7] Validate NEW creds (GET /me)…");
  const newCreds = {
    endpoint: CURRENT.endpoint,
    appKey: NEW_APP_KEY,
    appSecret: NEW_APP_SECRET,
    consumerKey: newConsumerKey,
  };
  const res = await ovh(newCreds, "GET", "/me");
  if (!res.ok) {
    console.error(`  FAIL: ${res.status} ${JSON.stringify(res.data)}`);
    console.error(
      "  Nowe creds nie działają — najprawdopodobniej brak approval w OVH UI.",
    );
    console.error("  Wróć do kroku 3 i potwierdź.");
    process.exit(1);
  }
  console.log(`  OK — nic: ${res.data?.nichandle ?? "?"}`);
}

async function step5UpdateCoolify(newConsumerKey) {
  console.log("[5/7] Update Coolify env (dashboard)…");
  const a1 = await upsertCoolifyEnv(
    COOLIFY_DASHBOARD_UUID,
    "OVH_APP_KEY",
    NEW_APP_KEY,
  );
  const a2 = await upsertCoolifyEnv(
    COOLIFY_DASHBOARD_UUID,
    "OVH_APP_SECRET",
    NEW_APP_SECRET,
  );
  const a3 = await upsertCoolifyEnv(
    COOLIFY_DASHBOARD_UUID,
    "OVH_CONSUMER_KEY",
    newConsumerKey,
  );
  console.log(`  OVH_APP_KEY: ${a1}, OVH_APP_SECRET: ${a2}, OVH_CONSUMER_KEY: ${a3}`);
}

async function step6Redeploy() {
  console.log("[6/7] Trigger redeploy dashboardu…");
  const r = await redeployDashboard(COOLIFY_DASHBOARD_UUID);
  console.log(`  ${r}`);
}

async function step7WaitForHealth() {
  console.log("[7/7] Wait + verify /api/health…");
  if (DRY_RUN) {
    console.log("  DRY_RUN: would curl health URL");
    return;
  }
  // 30 prób co 5s = 2.5 min — Coolify deploy zwykle <60s, ale mamy bufor.
  const maxAttempts = 30;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(HEALTH_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log(`  OK po ${i} prob.`);
        return;
      }
      console.log(`  attempt ${i}/${maxAttempts} — status ${res.status}, retry…`);
    } catch (err) {
      console.log(
        `  attempt ${i}/${maxAttempts} — ${err instanceof Error ? err.message : String(err)}, retry…`,
      );
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.error("  FAIL: /api/health nie odpowiedział OK przez 2.5 min.");
  console.error("  Sprawdź logi dashboardu w Coolify, ewentualnie rollback envów.");
  process.exit(1);
}

// ---------- main ----------

async function main() {
  console.log("OVH key rotation — interactive");
  console.log(`Endpoint: ${CURRENT.endpoint}`);
  console.log(`Coolify : ${COOLIFY_BASE_URL} (uuid=${COOLIFY_DASHBOARD_UUID})`);
  console.log(`Health  : ${HEALTH_URL}`);
  if (DRY_RUN) console.log("MODE    : DRY-RUN (read-only + would-* actions)\n");
  else console.log("MODE    : LIVE (will mutate Coolify env)\n");

  await step1ValidateCurrent();
  const { consumerKey, validationUrl } = await step2RequestNewConsumerKey();
  await step3WaitForUserApproval(validationUrl);
  await step4ValidateNewCreds(consumerKey);
  await step5UpdateCoolify(consumerKey);
  await step6Redeploy();
  await step7WaitForHealth();

  console.log("\nDONE.\n");
  console.log("Manual follow-up:");
  console.log("  1. Zinwaliduj stary consumer key w https://eu.api.ovh.com/console");
  console.log("     (rollback window minął — stary nie jest już potrzebny).");
  console.log("  2. Wpisz datę rotacji w reference_ovh.md.");
}

main().catch((err) => {
  console.error("\nFATAL:", err instanceof Error ? err.stack : err);
  process.exit(1);
});

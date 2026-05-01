import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { keycloak } from "@/lib/keycloak";
import type { Branding } from "./db";

/**
 * Branding propagation — globalne brand vars → Coolify env per aplikacja
 * + KC realm display name. Po zmianie env: trigger redeploy aplikacji
 * gdzie brand var jest buildtime (np. NEXT_PUBLIC_*).
 */

const logger = log.child({ module: "email-branding" });

interface PropagationTarget {
  appId: string;
  appLabel: string;
  /** Coolify application UUID; null gdy nie aplikujemy via Coolify (np. KC). */
  coolifyUuid: string | null;
  /** Mapping branding key → env var name. */
  envMapping: Partial<Record<keyof Branding, string>>;
  /**
   * Czy zmiana env wymaga redeploy (buildtime envs jak NEXT_PUBLIC_*).
   * False dla runtime-only envs.
   */
  requiresRedeploy: boolean;
}

/**
 * Resolves Coolify application UUID from env var. Returns null when env is
 * unset — propagation for that service will be skipped (no error).
 */
function resolveCoolifyUuidOptional(envName: string): string | null {
  const fromEnv = getOptionalEnv(envName);
  if (fromEnv) return fromEnv;
  logger.info("Coolify UUID env not set — skipping propagation for service", {
    envName,
  });
  return null;
}

/**
 * Resolves Coolify application UUID from env var. Logs warning + uses fallback
 * for backward-compat gdy env brak — ale per faza-1 cleanup planowane jest
 * full migration na env-only (fallbacks do usunięcia po weryfikacji prod
 * deployu z env-vars setniętymi).
 */
function resolveCoolifyUuid(envName: string, fallback: string): string {
  const fromEnv = getOptionalEnv(envName);
  if (fromEnv) return fromEnv;
  logger.warn("Coolify UUID env not set — falling back to hardcoded value", {
    envName,
    fallback,
  });
  return fallback;
}

const TARGETS: PropagationTarget[] = [
  {
    appId: "documenso",
    appLabel: "Documenso",
    coolifyUuid: resolveCoolifyUuidOptional("COOLIFY_UUID_DOCUMENSO"),
    envMapping: {
      brandName: "NEXT_PUBLIC_BRANDING_BRAND_NAME",
      brandUrl: "NEXT_PUBLIC_BRANDING_BRAND_URL",
      brandLogoUrl: "NEXT_PUBLIC_BRANDING_BRAND_LOGO",
      primaryColor: "NEXT_PUBLIC_BRANDING_BRAND_COLOR",
    },
    requiresRedeploy: true, // NEXT_PUBLIC_ = buildtime
  },
  {
    appId: "chatwoot",
    appLabel: "Chatwoot",
    coolifyUuid: resolveCoolifyUuidOptional("COOLIFY_UUID_CHATWOOT"),
    envMapping: {
      brandName: "INSTALLATION_NAME",
      brandUrl: "BRAND_URL",
      brandLogoUrl: "LOGO_THUMBNAIL_URL",
    },
    requiresRedeploy: false, // runtime
  },
  {
    appId: "outline",
    appLabel: "Outline",
    coolifyUuid: resolveCoolifyUuidOptional("COOLIFY_UUID_OUTLINE"),
    envMapping: {
      brandName: "TEAM_LOGO",
    },
    requiresRedeploy: false,
  },
  {
    appId: "directus",
    appLabel: "Directus",
    coolifyUuid: resolveCoolifyUuid(
      "COOLIFY_DIRECTUS_UUID",
      "pu8b37hw19akg5gx1445j3f2",
    ),
    envMapping: {
      brandName: "PROJECT_NAME",
      brandLogoUrl: "PROJECT_LOGO",
      primaryColor: "PROJECT_COLOR",
    },
    requiresRedeploy: false,
  },
  {
    appId: "moodle",
    appLabel: "Moodle",
    coolifyUuid: resolveCoolifyUuid(
      "COOLIFY_MOODLE_UUID",
      "upzcjtn9rcswer2vg2vey5d3",
    ),
    envMapping: {
      brandName: "MOODLE_SITE_NAME",
    },
    requiresRedeploy: false,
  },
  {
    appId: "dashboard",
    appLabel: "Dashboard",
    coolifyUuid: resolveCoolifyUuid(
      "COOLIFY_DASHBOARD_UUID",
      "cft13k98wnuqm4u8p6freksn",
    ),
    envMapping: {
      brandName: "NEXT_PUBLIC_BRAND_NAME",
      brandLogoUrl: "NEXT_PUBLIC_BRAND_LOGO",
      primaryColor: "NEXT_PUBLIC_BRAND_COLOR",
      supportEmail: "NEXT_PUBLIC_SUPPORT_EMAIL",
    },
    requiresRedeploy: true,
  },
];

export interface PropagationResult {
  appId: string;
  appLabel: string;
  status: "ok" | "skipped" | "failed";
  envChanges: number;
  redeployTriggered: boolean;
  error?: string;
}

interface CoolifyEnv {
  uuid: string;
  key: string;
  value: string;
  is_preview?: boolean;
  is_buildtime?: boolean;
  is_runtime?: boolean;
}

async function coolifyApi(): Promise<{ token: string; base: string } | null> {
  const token = getOptionalEnv("COOLIFY_API_TOKEN");
  const base =
    getOptionalEnv("COOLIFY_API_URL") ||
    "https://coolify.myperformance.pl/api/v1";
  if (!token) return null;
  return { token, base: base.replace(/\/$/, "") };
}

async function listAppEnvs(uuid: string): Promise<CoolifyEnv[]> {
  const cfg = await coolifyApi();
  if (!cfg) return [];
  const res = await fetch(`${cfg.base}/applications/${uuid}/envs`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as CoolifyEnv[];
}

async function setAppEnv(
  uuid: string,
  key: string,
  value: string,
  buildtime: boolean,
): Promise<void> {
  const cfg = await coolifyApi();
  if (!cfg) throw new Error("COOLIFY_API_TOKEN not configured");
  // Idempotent: list, delete duplicates, post fresh.
  const envs = await listAppEnvs(uuid);
  const dupes = envs.filter((e) => e.key === key);
  for (const d of dupes) {
    await fetch(`${cfg.base}/applications/${uuid}/envs/${d.uuid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
  }
  await fetch(`${cfg.base}/applications/${uuid}/envs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      is_buildtime: buildtime,
      is_runtime: true,
    }),
  });
}

async function triggerRedeploy(uuid: string): Promise<boolean> {
  const cfg = await coolifyApi();
  if (!cfg) return false;
  const res = await fetch(
    `${cfg.base}/deploy?uuid=${uuid}&force=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
    },
  );
  return res.ok;
}

/**
 * Propaguje branding do wszystkich apek. Per-app: ustawia env, opcjonalnie
 * triggeruje redeploy. Failed apps don't block reszty.
 */
export async function propagateBranding(
  branding: Branding,
  opts: { applyRedeploy: boolean },
): Promise<PropagationResult[]> {
  const results: PropagationResult[] = [];

  for (const target of TARGETS) {
    if (!target.coolifyUuid) {
      results.push({
        appId: target.appId,
        appLabel: target.appLabel,
        status: "skipped",
        envChanges: 0,
        redeployTriggered: false,
      });
      continue;
    }
    let envChanges = 0;
    try {
      for (const [brandKey, envKey] of Object.entries(target.envMapping) as Array<
        [keyof Branding, string]
      >) {
        const value = branding[brandKey];
        if (value === null || value === undefined || value === "") continue;
        await setAppEnv(
          target.coolifyUuid,
          envKey,
          String(value),
          target.requiresRedeploy,
        );
        envChanges += 1;
      }
      let redeployed = false;
      if (envChanges > 0 && target.requiresRedeploy && opts.applyRedeploy) {
        redeployed = await triggerRedeploy(target.coolifyUuid);
      }
      results.push({
        appId: target.appId,
        appLabel: target.appLabel,
        status: "ok",
        envChanges,
        redeployTriggered: redeployed,
      });
    } catch (err) {
      results.push({
        appId: target.appId,
        appLabel: target.appLabel,
        status: "failed",
        envChanges,
        redeployTriggered: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // KC realm display name update (non-Coolify path).
  // adminRequest("") = bare realm endpoint /admin/realms/{realm}
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    const cur = await keycloak.adminRequest("", adminToken);
    if (cur.ok) {
      const data = await cur.json();
      const updated = {
        ...data,
        displayName: branding.brandName,
        displayNameHtml: branding.brandName,
      };
      const r = await keycloak.adminRequest("", adminToken, {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      results.push({
        appId: "keycloak",
        appLabel: "Keycloak",
        status: r.ok ? "ok" : "failed",
        envChanges: 1,
        redeployTriggered: false,
        error: r.ok ? undefined : `realm PUT ${r.status}`,
      });
    }
  } catch (err) {
    results.push({
      appId: "keycloak",
      appLabel: "Keycloak",
      status: "failed",
      envChanges: 0,
      redeployTriggered: false,
      error: err instanceof Error ? err.message : String(err),
    });
    logger.warn("KC display name update failed", { err });
  }

  return results;
}

export function listPropagationTargets(): Array<{
  appId: string;
  appLabel: string;
  envKeys: string[];
  requiresRedeploy: boolean;
}> {
  return TARGETS.map((t) => ({
    appId: t.appId,
    appLabel: t.appLabel,
    envKeys: Object.values(t.envMapping),
    requiresRedeploy: t.requiresRedeploy,
  }));
}

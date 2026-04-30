import { withEmailClient } from "./client";

export interface OvhConfig {
  endpoint: "ovh-eu" | "ovh-us" | "ovh-ca";
  appKey: string | null;
  appSecret: string | null;
  consumerKey: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getOvhConfig(): Promise<OvhConfig> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT endpoint, app_key, app_secret, consumer_key, enabled, updated_at, updated_by
         FROM mp_ovh_config WHERE id = 1`,
    );
    const r = res.rows[0];
    return {
      endpoint: (r?.endpoint ?? "ovh-eu") as OvhConfig["endpoint"],
      appKey: r?.app_key ?? null,
      appSecret: r?.app_secret ?? null,
      consumerKey: r?.consumer_key ?? null,
      enabled: r?.enabled ?? false,
      updatedAt: r?.updated_at?.toISOString() ?? new Date().toISOString(),
      updatedBy: r?.updated_by ?? null,
    };
  });
}

export async function updateOvhConfig(
  patch: Partial<{
    endpoint: OvhConfig["endpoint"];
    appKey: string | null;
    appSecret: string | null;
    consumerKey: string | null;
    enabled: boolean;
  }>,
  actor: string,
): Promise<OvhConfig> {
  return withEmailClient(async (c) => {
    await c.query(
      `UPDATE mp_ovh_config SET
         endpoint = COALESCE($1, endpoint),
         app_key = COALESCE($2, app_key),
         app_secret = COALESCE($3, app_secret),
         consumer_key = COALESCE($4, consumer_key),
         enabled = COALESCE($5, enabled),
         updated_at = now(),
         updated_by = $6
       WHERE id = 1`,
      [
        patch.endpoint ?? null,
        patch.appKey ?? null,
        patch.appSecret ?? null,
        patch.consumerKey ?? null,
        patch.enabled ?? null,
        actor,
      ],
    );
    return getOvhConfig();
  });
}

import { withEmailClient } from "./client";

export interface KcLocalizationOverride {
  locale: string;
  key: string;
  value: string;
  updatedAt: string;
  updatedBy: string | null;
}

export async function listKcLocalization(
  locale: string,
): Promise<KcLocalizationOverride[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT locale, key, value, updated_at, updated_by
         FROM mp_kc_localization WHERE locale = $1 ORDER BY key`,
      [locale],
    );
    return res.rows.map((r) => ({
      locale: r.locale,
      key: r.key,
      value: r.value,
      updatedAt: r.updated_at.toISOString(),
      updatedBy: r.updated_by,
    }));
  });
}

export async function upsertKcLocalization(
  locale: string,
  key: string,
  value: string,
  actor: string,
): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `INSERT INTO mp_kc_localization (locale, key, value, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (locale, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [locale, key, value, actor],
    ),
  );
}

export async function deleteKcLocalization(
  locale: string,
  key: string,
): Promise<void> {
  await withEmailClient((c) =>
    c.query(
      `DELETE FROM mp_kc_localization WHERE locale = $1 AND key = $2`,
      [locale, key],
    ),
  );
}

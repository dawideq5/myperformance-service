import { AREAS } from "./areas";
import {
  appendIamAudit,
  isIamDbConfigured,
  upsertMetarole,
  withIamClient,
} from "./db";
import { log } from "@/lib/logger";

/**
 * Seed central_metaroles + app_role_mapping z katalogu `AREAS` w `areas.ts`.
 *
 * Uruchamiane idempotentnie przy starcie dashboardu (lazy-seed) albo ręcznie
 * przez `/api/admin/iam/seed`. Każdy seed dostaje `system_seed=true` — nie
 * można go skasować z UI (chroni przed pustym KC realm przy błędzie).
 *
 * Slug metarole = dotychczasowa nazwa realm role KC (np. `chatwoot_agent`),
 * żeby ułatwić migrację — wszystkie istniejące rekordy w KC realm role,
 * user_role_junction, app_role_mapping pracują na tym samym kluczu.
 */

const logger = log.child({ module: "iam-seed" });

export interface SeedResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ slug: string; error: string }>;
}

export async function seedMetarolesFromAreas(
  actor: string = "system:seed",
): Promise<SeedResult> {
  if (!isIamDbConfigured()) {
    logger.warn("seed skipped: DATABASE_URL not configured");
    return { inserted: 0, updated: 0, skipped: 0, errors: [] };
  }

  const result: SeedResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  const existing = await withIamClient(async (c) => {
    const r = await c.query(`SELECT slug FROM central_metaroles`);
    return new Set(r.rows.map((row) => row.slug as string));
  });

  for (const area of AREAS) {
    for (const kcRole of area.kcRoles) {
      try {
        const wasExisting = existing.has(kcRole.name);
        await upsertMetarole({
          slug: kcRole.name,
          label: kcRole.description,
          description: kcRole.description,
          areaId: area.id,
          priority: kcRole.priority,
          systemSeed: true,
          mappings: area.nativeProviderId
            ? [
                {
                  appId: area.nativeProviderId,
                  nativeRoleId: kcRole.nativeRoleId ?? null,
                  nativeRoleName: kcRole.nativeRoleId ?? null,
                },
              ]
            : [],
        });
        if (wasExisting) result.updated += 1;
        else result.inserted += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ slug: kcRole.name, error: message });
        logger.error("seed failed for role", { slug: kcRole.name, err: message });
      }
    }
  }

  await appendIamAudit({
    actor,
    operation: "seed.apply",
    targetType: "area",
    status: result.errors.length > 0 ? "error" : "ok",
    details: {
      inserted: result.inserted,
      updated: result.updated,
      errors: result.errors.length,
    },
  });

  logger.info("seed completed", {
    inserted: result.inserted,
    updated: result.updated,
    errors: result.errors.length,
  });
  return result;
}

export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import {
  COLLECTION_SPECS,
  ensureCollection,
  isConfigured,
  upsertItem,
} from "@/lib/directus-cms";
import { getBranding, listTemplates } from "@/lib/email/db";

/**
 * GET — sprawdza konfigurację Directusa.
 * POST — wykonuje pełny push: ensure collections + upsert wszystkich rekordów.
 */
export async function GET() {
  try {
    return createSuccessResponse({
      configured: await isConfigured(),
      collections: COLLECTION_SPECS.map((c) => c.collection),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);

    if (!(await isConfigured())) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Directus nie jest skonfigurowany. Ustaw DIRECTUS_URL + DIRECTUS_ADMIN_TOKEN.",
        503,
      );
    }

    const errors: string[] = [];
    let collectionsCreated = 0;
    let itemsSynced = 0;

    for (const spec of COLLECTION_SPECS) {
      try {
        await ensureCollection(spec);
        collectionsCreated++;
      } catch (err) {
        errors.push(
          `${spec.collection}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Branding (singleton, fixed id="default")
    try {
      const b = await getBranding();
      await upsertItem("mp_branding_cms", "default", {
        id: "default",
        logo_url: b.brandLogoUrl,
        accent_color: b.primaryColor,
        footer_html: b.legalName ?? null,
        synced_at: new Date().toISOString(),
      });
      itemsSynced++;
    } catch (err) {
      errors.push(`branding: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Templates
    try {
      const tpls = await listTemplates();
      for (const t of tpls) {
        await upsertItem("mp_email_templates_cms", t.actionKey, {
          id: t.actionKey,
          kind: t.actionKey,
          subject: t.subject,
          html: t.body,
          synced_at: new Date().toISOString(),
        });
        itemsSynced++;
      }
    } catch (err) {
      errors.push(
        `templates: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return createSuccessResponse({
      ok: errors.length === 0,
      collectionsCreated,
      itemsSynced,
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

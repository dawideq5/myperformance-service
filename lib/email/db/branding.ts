import { withEmailClient } from "./client";

export interface Branding {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  fromDisplay: string | null;
  replyTo: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getBranding(): Promise<Branding> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT brand_name, brand_url, brand_logo_url, primary_color,
              support_email, legal_name, from_display, reply_to,
              updated_at, updated_by
         FROM mp_branding WHERE id = 1`,
    );
    const r = res.rows[0];
    return {
      brandName: r.brand_name ?? "MyPerformance",
      brandUrl: r.brand_url,
      brandLogoUrl: r.brand_logo_url,
      primaryColor: r.primary_color,
      supportEmail: r.support_email,
      legalName: r.legal_name,
      fromDisplay: r.from_display,
      replyTo: r.reply_to,
      updatedAt: r.updated_at.toISOString(),
      updatedBy: r.updated_by,
    };
  });
}

export interface BrandingPatch {
  brandName?: string;
  brandUrl?: string | null;
  brandLogoUrl?: string | null;
  primaryColor?: string | null;
  supportEmail?: string | null;
  legalName?: string | null;
  fromDisplay?: string | null;
  replyTo?: string | null;
}

export async function updateBranding(
  patch: BrandingPatch,
  actor: string,
): Promise<Branding> {
  const next = await withEmailClient(async (c) => {
    await c.query(
      `UPDATE mp_branding SET
         brand_name      = COALESCE($1, brand_name),
         brand_url       = COALESCE($2, brand_url),
         brand_logo_url  = COALESCE($3, brand_logo_url),
         primary_color   = COALESCE($4, primary_color),
         support_email   = COALESCE($5, support_email),
         legal_name      = COALESCE($6, legal_name),
         from_display    = COALESCE($7, from_display),
         reply_to        = COALESCE($8, reply_to),
         updated_at      = now(),
         updated_by      = $9
       WHERE id = 1`,
      [
        patch.brandName ?? null,
        patch.brandUrl ?? null,
        patch.brandLogoUrl ?? null,
        patch.primaryColor ?? null,
        patch.supportEmail ?? null,
        patch.legalName ?? null,
        patch.fromDisplay ?? null,
        patch.replyTo ?? null,
        actor,
      ],
    );
    return getBranding();
  });
  // Write-through do Directus CMS (best-effort, non-blocking).
  void import("@/lib/directus-cms")
    .then(async ({ isConfigured, ensureCollection, upsertItem, COLLECTION_SPECS }) => {
      if (!(await isConfigured())) return;
      const spec = COLLECTION_SPECS.find((c) => c.collection === "mp_branding_cms");
      if (spec) await ensureCollection(spec);
      await upsertItem("mp_branding_cms", "default", {
        id: "default",
        logo_url: next.brandLogoUrl,
        accent_color: next.primaryColor,
        footer_html: next.legalName,
        synced_at: new Date().toISOString(),
      });
    })
    .catch(() => undefined);
  return next;
}

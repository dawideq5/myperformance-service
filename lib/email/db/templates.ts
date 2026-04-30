import { withEmailClient } from "./client";

export interface EmailTemplate {
  actionKey: string;
  enabled: boolean;
  subject: string;
  body: string;
  layoutId: string | null;
  smtpConfigId: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getTemplate(actionKey: string): Promise<EmailTemplate | null> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by
         FROM mp_email_templates WHERE action_key = $1`,
      [actionKey],
    );
    return res.rows[0] ? rowToTemplate(res.rows[0]) : null;
  });
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by
         FROM mp_email_templates ORDER BY action_key`,
    );
    return res.rows.map(rowToTemplate);
  });
}

export async function upsertTemplate(args: {
  actionKey: string;
  enabled?: boolean;
  subject: string;
  body: string;
  layoutId?: string | null;
  smtpConfigId?: string | null;
  actor: string;
}): Promise<EmailTemplate> {
  const next = await withEmailClient(async (c) => {
    const res = await c.query(
      `INSERT INTO mp_email_templates
         (action_key, enabled, subject, body, layout_id, smtp_config_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (action_key) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         subject = EXCLUDED.subject,
         body = EXCLUDED.body,
         layout_id = EXCLUDED.layout_id,
         smtp_config_id = EXCLUDED.smtp_config_id,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING action_key, enabled, subject, body, layout_id, smtp_config_id, updated_at, updated_by`,
      [
        args.actionKey,
        args.enabled !== false,
        args.subject,
        args.body,
        args.layoutId ?? null,
        args.smtpConfigId ?? null,
        args.actor,
      ],
    );
    return rowToTemplate(res.rows[0]);
  });
  // Write-through do Directus CMS — synchronizujemy treść szablonów żeby
  // content team mógł je oglądać/edytować w natywnym Directus UI.
  void import("@/lib/directus-cms")
    .then(async ({ isConfigured, ensureCollection, upsertItem, COLLECTION_SPECS }) => {
      if (!(await isConfigured())) return;
      const spec = COLLECTION_SPECS.find((c) => c.collection === "mp_email_templates_cms");
      if (spec) await ensureCollection(spec);
      await upsertItem("mp_email_templates_cms", next.actionKey, {
        id: next.actionKey,
        kind: next.actionKey,
        subject: next.subject,
        html: next.body,
        synced_at: new Date().toISOString(),
      });
    })
    .catch(() => undefined);

  // Sync KC localization — gdy edytujemy szablon `auth.*`, pushujemy treść
  // do KC realm localization żeby KC FreeMarker email templates używały
  // naszej kopii. Mapowanie actionKey → KC localization keys.
  void import("@/lib/email/kc-localization")
    .then(async ({ ensureLocaleEnabled, setLocaleMessage }) => {
      const map = AUTH_TO_KC_LOCALIZATION[next.actionKey];
      if (!map) return;
      await ensureLocaleEnabled("pl");
      for (const [kcKey, value] of Object.entries(map(next.subject, next.body))) {
        await setLocaleMessage("pl", kcKey, value).catch(() => undefined);
      }
    })
    .catch(() => undefined);

  return next;
}

/**
 * Mapowanie actionKey z naszego catalog'u → klucze KC realm localization.
 * KC FreeMarker email templates (theme=base) resolvują `${msg(key)}` z
 * tego mappingu. HTML body trafia do `*BodyHtml` keys, plain do `*Body`.
 */
const AUTH_TO_KC_LOCALIZATION: Record<
  string,
  (subject: string, body: string) => Record<string, string>
> = {
  "auth.account-activation": (s, b) => ({
    emailVerificationSubject: s,
    emailVerificationBody: b,
    emailVerificationBodyHtml: b,
  }),
  "auth.password-reset": (s, b) => ({
    passwordResetSubject: s,
    passwordResetBody: b,
    passwordResetBodyHtml: b,
  }),
  "auth.email-update": (s, b) => ({
    emailUpdateConfirmationSubject: s,
    emailUpdateConfirmationBody: b,
    emailUpdateConfirmationBodyHtml: b,
  }),
  "auth.required-actions": (s, b) => ({
    executeActionsSubject: s,
    executeActionsBody: b,
    executeActionsBodyHtml: b,
  }),
  "auth.idp-link": (s, b) => ({
    identityProviderLinkSubject: s,
    identityProviderLinkBody: b,
    identityProviderLinkBodyHtml: b,
  }),
  "auth.account-disabled": (s, b) => ({
    loginDisabledSubject: s,
    loginDisabledBody: b,
  }),
};

export async function deleteTemplate(actionKey: string): Promise<void> {
  await withEmailClient((c) =>
    c.query(`DELETE FROM mp_email_templates WHERE action_key = $1`, [actionKey]),
  );
}

interface TemplateRow {
  action_key: string;
  enabled: boolean;
  subject: string;
  body: string;
  layout_id: string | null;
  smtp_config_id: string | null;
  updated_at: Date;
  updated_by: string | null;
}

function rowToTemplate(r: TemplateRow): EmailTemplate {
  return {
    actionKey: r.action_key,
    enabled: r.enabled,
    subject: r.subject,
    body: r.body,
    layoutId: r.layout_id,
    smtpConfigId: r.smtp_config_id,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}

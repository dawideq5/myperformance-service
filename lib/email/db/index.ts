/**
 * Email / branding / postal admin database layer.
 *
 * Modułowy split:
 *   - schema.ts          → ensureSchema (CREATE TABLE IF NOT EXISTS dla 16 tabel)
 *   - client.ts          → withEmailClient + schemaReady singleton
 *   - branding.ts        → mp_branding (singleton id=1) + write-through Directus
 *   - kc-localization.ts → mp_kc_localization (locale,key)
 *   - audit.ts           → mp_postal_audit (append-only)
 *   - layouts.ts         → mp_email_layouts (szkielety) + DEFAULT_LAYOUT_HTML
 *   - smtp.ts            → mp_smtp_configs (aliasy SMTP per template)
 *   - templates.ts       → mp_email_templates + AUTH_TO_KC_LOCALIZATION mapping
 *   - ovh-config.ts      → mp_ovh_config (singleton id=1)
 */

export { withEmailClient } from "./client";
export type { Branding, BrandingPatch } from "./branding";
export { getBranding, updateBranding } from "./branding";
export type { KcLocalizationOverride } from "./kc-localization";
export {
  listKcLocalization,
  upsertKcLocalization,
  deleteKcLocalization,
} from "./kc-localization";
export type { PostalAuditEntry } from "./audit";
export { appendPostalAudit } from "./audit";
export type { EmailLayout } from "./layouts";
export {
  ensureDefaultLayout,
  listLayouts,
  getDefaultLayout,
  getLayout,
  getLayoutBySlug,
  upsertLayout,
} from "./layouts";
export type { SmtpConfig } from "./smtp";
export {
  ensureDefaultSmtpConfig,
  listSmtpConfigs,
  getDefaultSmtpConfig,
  getSmtpConfig,
  upsertSmtpConfig,
  deleteSmtpConfig,
} from "./smtp";
export type { EmailTemplate } from "./templates";
export {
  getTemplate,
  listTemplates,
  upsertTemplate,
  deleteTemplate,
} from "./templates";
export type { OvhConfig } from "./ovh-config";
export { getOvhConfig, updateOvhConfig } from "./ovh-config";
export type { SmtpProfile, SmtpProfileInput } from "./smtp-profiles";
export {
  ensureDefaultSmtpProfiles,
  listSmtpProfiles,
  getSmtpProfile,
  getDefaultSmtpProfile,
  upsertSmtpProfile,
  deleteSmtpProfile,
} from "./smtp-profiles";

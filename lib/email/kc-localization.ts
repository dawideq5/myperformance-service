import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";

const logger = log.child({ module: "kc-localization" });

const REALM = process.env.KEYCLOAK_REALM || "MyPerformance";

/**
 * Custom email texts in Keycloak via realm localization API.
 * Workflow:
 *   1. ensureLocaleEnabled() — enable internationalization + add locale.
 *   2. setKey(locale, key, value) — POST/PUT message to KC.
 *   3. KC FreeMarker email templates resolve `${msg("key")}` from this map.
 *
 * Limitation: localization values są plain strings (no FreeMarker logic).
 * Pełna kontrola nad layoutem HTML wymaga custom email theme JAR.
 */

export const KC_EMAIL_KEYS = [
  // verify-email
  { key: "emailVerificationSubject", label: "Weryfikacja — temat" },
  { key: "emailVerificationBody", label: "Weryfikacja — treść (text)" },
  { key: "emailVerificationBodyHtml", label: "Weryfikacja — treść (HTML)" },
  // reset-password
  { key: "passwordResetSubject", label: "Reset hasła — temat" },
  { key: "passwordResetBody", label: "Reset hasła — treść (text)" },
  { key: "passwordResetBodyHtml", label: "Reset hasła — treść (HTML)" },
  // executable-action
  { key: "executeActionsSubject", label: "Wymagane akcje — temat" },
  { key: "executeActionsBody", label: "Wymagane akcje — treść (text)" },
  { key: "executeActionsBodyHtml", label: "Wymagane akcje — treść (HTML)" },
  // email-update
  { key: "emailUpdateConfirmationSubject", label: "Zmiana emaila — temat" },
  { key: "emailUpdateConfirmationBody", label: "Zmiana emaila — treść (text)" },
  {
    key: "emailUpdateConfirmationBodyHtml",
    label: "Zmiana emaila — treść (HTML)",
  },
  // identity-provider-link
  { key: "identityProviderLinkSubject", label: "Powiązanie IdP — temat" },
  { key: "identityProviderLinkBody", label: "Powiązanie IdP — treść (text)" },
  {
    key: "identityProviderLinkBodyHtml",
    label: "Powiązanie IdP — treść (HTML)",
  },
  // login disabled
  { key: "loginDisabledSubject", label: "Konto wyłączone — temat" },
  { key: "loginDisabledBody", label: "Konto wyłączone — treść" },
] as const;

export type KcEmailKey = (typeof KC_EMAIL_KEYS)[number]["key"];

export async function ensureLocaleEnabled(locale: string): Promise<void> {
  const adminToken = await keycloak.getServiceAccountToken();
  const cur = await keycloak.adminRequest(`/realms/${REALM}`, adminToken);
  if (!cur.ok) throw new Error(`KC GET realm ${cur.status}`);
  const data = (await cur.json()) as {
    internationalizationEnabled?: boolean;
    supportedLocales?: string[];
    defaultLocale?: string;
  };
  const supported = new Set(data.supportedLocales ?? []);
  const needs =
    data.internationalizationEnabled !== true || !supported.has(locale);
  if (!needs) return;
  supported.add(locale);
  const next = {
    ...data,
    internationalizationEnabled: true,
    supportedLocales: Array.from(supported),
    defaultLocale: data.defaultLocale ?? locale,
  };
  const res = await keycloak.adminRequest(`/realms/${REALM}`, adminToken, {
    method: "PUT",
    body: JSON.stringify(next),
  });
  if (!res.ok) {
    throw new Error(`KC PUT realm (i18n enable) ${res.status}`);
  }
  logger.info("realm i18n enabled + locale added", { locale });
}

export async function listLocaleMessages(
  locale: string,
): Promise<Record<string, string>> {
  const adminToken = await keycloak.getServiceAccountToken();
  const res = await keycloak.adminRequest(
    `/realms/${REALM}/localization/${locale}`,
    adminToken,
  );
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`KC GET localization ${res.status}`);
  // Body może być array `[{key,value}]` lub object `{key:value}`.
  const data = (await res.json()) as
    | Array<{ key: string; value: string }>
    | Record<string, string>;
  if (Array.isArray(data)) {
    const out: Record<string, string> = {};
    for (const e of data) out[e.key] = e.value;
    return out;
  }
  return data;
}

export async function setLocaleMessage(
  locale: string,
  key: string,
  value: string,
): Promise<void> {
  const adminToken = await keycloak.getServiceAccountToken();
  // KC expects `text/plain` body for single-key localization endpoint.
  const res = await keycloak.adminRequest(
    `/realms/${REALM}/localization/${locale}/${encodeURIComponent(key)}`,
    adminToken,
    {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
      },
      body: value,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`KC PUT localization ${res.status} ${body.slice(0, 100)}`);
  }
}

export async function deleteLocaleMessage(
  locale: string,
  key: string,
): Promise<void> {
  const adminToken = await keycloak.getServiceAccountToken();
  const res = await keycloak.adminRequest(
    `/realms/${REALM}/localization/${locale}/${encodeURIComponent(key)}`,
    adminToken,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`KC DELETE localization ${res.status}`);
  }
}

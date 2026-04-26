/**
 * Next.js instrumentation hook — uruchamia się raz przy starcie serwera.
 * Inicjalizujemy tu schemy DB tak żeby pierwszy request od użytkownika
 * nie musiał ich tworzyć (i żeby nie było race condition gdy kilka
 * requestów wpadnie równocześnie).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Lazy imports — instrumentation może być wywołane przed pełną inicjalizacją.
  try {
    const { withEmailClient, ensureDefaultLayout, ensureDefaultSmtpConfig } =
      await import("@/lib/email/db");
    // Wymusza ensureSchema (CREATE TABLE IF NOT EXISTS).
    await withEmailClient(async () => {});
    // Seed default layout + SMTP config jeśli brak.
    await ensureDefaultLayout();
    await ensureDefaultSmtpConfig();
    // eslint-disable-next-line no-console
    console.log("[instrumentation] email schema initialised");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] email schema init failed (will retry on first request):",
      err instanceof Error ? err.message : err,
    );
  }

  // Background timer pollujący KC events co 30s. Phasetwo webhook delivery
  // jest niesprawne w naszym setupie (storeWebhookEvents=true ale send
  // worker nie startuje), więc czytamy KC Admin API bezpośrednio.
  try {
    const { pollKcEvents } = await import("@/lib/security/kc-events-poll");
    const interval = 30_000;
    setInterval(() => {
      void pollKcEvents().catch(() => undefined);
    }, interval).unref?.();
    // Pierwsze odpalenie 5s po starcie żeby DB miał szansę uruchomić.
    setTimeout(() => {
      void pollKcEvents().catch(() => undefined);
    }, 5_000).unref?.();
    // eslint-disable-next-line no-console
    console.log(`[instrumentation] kc-events-poll started (every ${interval}ms)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] kc-events-poll init failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // KC localization initial seed — push wariantów KC-friendly (numbered
  // args {0}, {1}, {2}) do realm localization. KC FreeMarker email
  // templates resolwują ${msg("key", arg0, arg1)} z tego mapping.
  // Mustache placeholders {{user.firstName}} z naszych szablonów NIE
  // pasują do KC — dla KC trzymamy oddzielne wersje w lib/email/kc-templates.ts.
  try {
    const { ensureLocaleEnabled, setLocaleMessage } = await import(
      "@/lib/email/kc-localization"
    );
    const { KC_LOCALIZATION_VARIANTS } = await import(
      "@/lib/email/kc-templates"
    );

    const KC_KEYS: Record<string, [string, string, string]> = {
      "auth.account-activation": [
        "emailVerificationSubject",
        "emailVerificationBody",
        "emailVerificationBodyHtml",
      ],
      "auth.password-reset": [
        "passwordResetSubject",
        "passwordResetBody",
        "passwordResetBodyHtml",
      ],
      "auth.email-update": [
        "emailUpdateConfirmationSubject",
        "emailUpdateConfirmationBody",
        "emailUpdateConfirmationBodyHtml",
      ],
      "auth.required-actions": [
        "executeActionsSubject",
        "executeActionsBody",
        "executeActionsBodyHtml",
      ],
      "auth.idp-link": [
        "identityProviderLinkSubject",
        "identityProviderLinkBody",
        "identityProviderLinkBodyHtml",
      ],
    };

    await ensureLocaleEnabled("pl").catch(() => undefined);

    let pushed = 0;
    for (const [actionKey, variant] of Object.entries(KC_LOCALIZATION_VARIANTS)) {
      const keys = KC_KEYS[actionKey];
      if (!keys) continue;
      const [kSubject, kBody, kBodyHtml] = keys;
      await setLocaleMessage("pl", kSubject, variant.subject).catch(() => undefined);
      await setLocaleMessage("pl", kBody, variant.body).catch(() => undefined);
      await setLocaleMessage("pl", kBodyHtml, variant.bodyHtml).catch(
        () => undefined,
      );
      pushed += 3;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[instrumentation] KC localization seed: ${pushed} keys pushed (locale=pl)`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] KC localization seed failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // Initial Directus push — przy starcie pushujemy aktualny branding +
  // szablony żeby content team natychmiast widział je w Directus UI bez
  // czekania aż admin coś zmieni.
  try {
    const { isConfigured, ensureCollection, upsertItem, COLLECTION_SPECS } =
      await import("@/lib/directus-cms");
    if (await isConfigured()) {
      const { getBranding, listTemplates } = await import("@/lib/email/db");
      for (const spec of COLLECTION_SPECS) {
        await ensureCollection(spec).catch(() => undefined);
      }
      const b = await getBranding();
      await upsertItem("mp_branding_cms", "default", {
        id: "default",
        logo_url: b.brandLogoUrl,
        accent_color: b.primaryColor,
        footer_html: b.legalName,
        synced_at: new Date().toISOString(),
      }).catch(() => undefined);
      const tpls = await listTemplates();
      for (const t of tpls) {
        await upsertItem("mp_email_templates_cms", t.actionKey, {
          id: t.actionKey,
          kind: t.actionKey,
          subject: t.subject,
          html: t.body,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      // eslint-disable-next-line no-console
      console.log(
        `[instrumentation] Directus initial push: branding + ${tpls.length} templates`,
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] Directus initial push failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

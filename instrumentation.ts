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

  // KC localization initial seed — push wszystkich auth.* templates do
  // KC realm localization żeby KC FreeMarker email templates używały
  // naszych treści zamiast generycznych defaults ("Administrator właśnie
  // zażądał aktualizacji konta..."). Bez tego seedu KC localization keys
  // są puste dopóki admin ręcznie nie kliknie Zapisz na każdym auth.* template.
  try {
    const { ensureLocaleEnabled, setLocaleMessage } = await import(
      "@/lib/email/kc-localization"
    );
    const { EMAIL_ACTIONS } = await import("@/lib/email/templates-catalog");
    const { listTemplates } = await import("@/lib/email/db");

    const AUTH_KC_MAP: Record<
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

    await ensureLocaleEnabled("pl").catch(() => undefined);
    await ensureLocaleEnabled("en").catch(() => undefined);

    const stored = await listTemplates();
    const overrideMap = new Map(stored.map((t) => [t.actionKey, t]));

    let pushed = 0;
    for (const action of EMAIL_ACTIONS) {
      const mapper = AUTH_KC_MAP[action.key];
      if (!mapper) continue;
      const t = overrideMap.get(action.key);
      const subject = t?.subject ?? action.defaultSubject;
      const body = t?.body ?? action.defaultBody;
      const kvs = mapper(subject, body);
      for (const [k, v] of Object.entries(kvs)) {
        await setLocaleMessage("pl", k, v).catch(() => undefined);
        pushed++;
      }
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

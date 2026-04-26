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

  // Initial seed mp_email_templates — bez tego tabela jest pusta i admin
  // edytujący w /admin/email widzi defaulty z catalog ale po zapisie nic
  // nie persystuje się dla kolejnych userów. Idempotent: ON CONFLICT DO NOTHING.
  try {
    const { withClient } = await import("@/lib/db");
    const { EMAIL_ACTIONS } = await import("@/lib/email/templates-catalog");
    let seeded = 0;
    await withClient(async (c) => {
      for (const action of EMAIL_ACTIONS) {
        // Skip "external-link" / "readonly" — te nie mają sensownego defaultBody
        if (action.editability === "external-link" || action.editability === "readonly") {
          continue;
        }
        const r = await c.query(
          `INSERT INTO mp_email_templates
             (action_key, enabled, subject, body, layout_id, smtp_config_id, updated_by)
           VALUES ($1, true, $2, $3, NULL, NULL, 'system:seed')
           ON CONFLICT (action_key) DO NOTHING`,
          [action.key, action.defaultSubject, action.defaultBody],
        );
        if (r.rowCount && r.rowCount > 0) seeded++;
      }
    });
    // eslint-disable-next-line no-console
    console.log(`[instrumentation] mp_email_templates seed: ${seeded} new templates`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] mp_email_templates seed failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // MFA enforcement dla admin role (Zero Trust). Co 6h sprawdza userów
  // z superadmin roles i jeśli ktoś nie ma TOTP/WebAuthn — dodaje
  // CONFIGURE_TOTP required-action. User przy następnym loginie skonfiguruje.
  try {
    const { enforceMfaForAdmins } = await import("@/lib/security/mfa-enforcer");
    const interval = 6 * 60 * 60 * 1000;
    setInterval(() => {
      void enforceMfaForAdmins().catch(() => undefined);
    }, interval).unref?.();
    setTimeout(() => {
      void enforceMfaForAdmins().catch(() => undefined);
    }, 30_000).unref?.();
    // eslint-disable-next-line no-console
    console.log("[instrumentation] mfa-enforcer scheduled (every 6h)");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] mfa-enforcer init failed:",
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

  // Initial Directus push — branding + szablony + app catalog z tagami
  // (tagi NIE są nadpisywane jeśli admin już je edytował w Directusie).
  try {
    const { isConfigured, ensureCollection, upsertItem, listItems, COLLECTION_SPECS } =
      await import("@/lib/directus-cms");
    if (await isConfigured()) {
      const { getBranding, listTemplates } = await import("@/lib/email/db");
      const { APP_CATALOG } = await import("@/lib/app-catalog");

      for (const spec of COLLECTION_SPECS) {
        await ensureCollection(spec).catch(() => undefined);
      }

      // Branding (singleton)
      const b = await getBranding();
      await upsertItem("mp_branding_cms", "default", {
        id: "default",
        logo_url: b.brandLogoUrl,
        accent_color: b.primaryColor,
        footer_html: b.legalName,
        synced_at: new Date().toISOString(),
      }).catch(() => undefined);

      // Email templates
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

      // App catalog — preserve admin-edited tags
      const existingApps = await listItems<{ id: string; tags?: string }>(
        "mp_app_catalog",
        { limit: 200 },
      ).catch(() => [] as Array<{ id: string; tags?: string }>);
      const existingTags = new Map(existingApps.map((r) => [r.id, r.tags]));
      let appsPushed = 0;
      for (const entry of APP_CATALOG) {
        const preservedTags = existingTags.get(entry.id);
        const initialTags = preservedTags ?? (entry.defaultTags?.join(",") ?? "");
        await upsertItem("mp_app_catalog", entry.id, {
          id: entry.id,
          title: entry.title,
          subtitle: entry.subtitle,
          href: entry.href,
          requires_area: entry.requiresArea ?? "",
          requires_min_priority: entry.requiresMinPriority ?? 0,
          tags: initialTags,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        appsPushed++;
      }

      // Areas registry mirror
      const { AREAS } = await import("@/lib/permissions/areas");
      let areasPushed = 0;
      for (const a of AREAS) {
        await upsertItem("mp_areas_registry", a.id, {
          id: a.id,
          label: a.label,
          description: a.description,
          provider: a.provider,
          icon: a.icon ?? null,
          kc_roles_count: a.kcRoles.length,
          kc_roles: a.kcRoles.map((r) => ({
            name: r.name,
            label: r.label,
            priority: r.priority,
            nativeRoleId: r.nativeRoleId ?? null,
          })),
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        areasPushed++;
      }

      // Notif events registry mirror
      const { NOTIF_EVENTS } = await import("@/lib/preferences");
      let notifPushed = 0;
      for (const [key, ev] of Object.entries(NOTIF_EVENTS)) {
        const def = ev as {
          label: string;
          category: string;
          defaultInApp: boolean;
          defaultEmail: boolean;
          requiresArea?: string | null;
        };
        await upsertItem("mp_notif_events_registry", key, {
          id: key,
          label: def.label,
          category: def.category,
          default_in_app: def.defaultInApp,
          default_email: def.defaultEmail,
          requires_area: def.requiresArea ?? "",
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        notifPushed++;
      }

      // Email layouts mirror
      const { listLayouts } = await import("@/lib/email/db");
      const layouts = await listLayouts().catch(() => []);
      let layoutsPushed = 0;
      for (const l of layouts) {
        await upsertItem("mp_email_layouts_cms", l.id, {
          id: l.id,
          name: l.name,
          html: l.html,
          is_default: l.isDefault,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        layoutsPushed++;
      }

      // SMTP configs mirror — bez secrets (smtpUser/smtpPassword pomijamy)
      const { listSmtpConfigs } = await import("@/lib/email/db");
      const smtps = await listSmtpConfigs().catch(() => []);
      let smtpsPushed = 0;
      for (const s of smtps) {
        await upsertItem("mp_smtp_configs_cms", s.id, {
          id: s.id,
          alias: s.alias,
          host: s.smtpHost,
          port: s.smtpPort,
          secure: s.useTls,
          from_address: s.fromEmail,
          from_name: s.fromDisplay,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        smtpsPushed++;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[instrumentation] Directus initial push: branding + ${tpls.length} templates + ${appsPushed} apps + ${areasPushed} areas + ${notifPushed} notif events + ${layoutsPushed} layouts + ${smtpsPushed} smtps`,
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

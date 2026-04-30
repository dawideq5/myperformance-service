/**
 * Next.js instrumentation hook — uruchamia się raz przy starcie serwera.
 * Inicjalizujemy tu schemy DB tak żeby pierwszy request od użytkownika
 * nie musiał ich tworzyć (i żeby nie było race condition gdy kilka
 * requestów wpadnie równocześnie).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ── OpenTelemetry — startujemy NAJWCZEŚNIEJ żeby auto-instr łapało
  //    wszystkie późniejsze importy (pg, mysql2, fetch, http).
  //    Fail-closed: jeśli `OTEL_EXPORTER_OTLP_ENDPOINT` nieskonfigurowane,
  //    SDK nie startuje, brak overhead.
  try {
    const { startOtel } = await import("@/lib/observability/otel");
    const result = await startOtel();
    if (result.enabled) {
      // eslint-disable-next-line no-console
      console.log("[instrumentation] OpenTelemetry enabled");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] OTel init failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

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

  // MFA enforcement OPT-IN przez env MFA_ENFORCE_ADMINS=true. Domyślnie
  // wyłączone — admin sam decyduje w KC Admin Console kogo wymusić
  // (Authentication → Required Actions). Brak narzucania z dashboardu.
  if (process.env.MFA_ENFORCE_ADMINS === "true") {
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
      console.log("[instrumentation] mfa-enforcer scheduled (MFA_ENFORCE_ADMINS=true)");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[instrumentation] mfa-enforcer init failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Background timer pollujący KC events co 5s. Phasetwo webhook delivery
  // jest niesprawne w naszym setupie (storeWebhookEvents=true ale send
  // worker nie startuje), więc czytamy KC Admin API bezpośrednio.
  // 5s = kompromis między natychmiastowością UX a obciążeniem KC. Stare 30s
  // generowało user-perceived "powiadomienia są opóźnione".
  try {
    const { pollKcEvents } = await import("@/lib/security/kc-events-poll");
    const interval = 5_000;
    setInterval(() => {
      void pollKcEvents().catch(() => undefined);
    }, interval).unref?.();
    // Pierwsze odpalenie 3s po starcie żeby DB miał szansę uruchomić.
    setTimeout(() => {
      void pollKcEvents().catch(() => undefined);
    }, 3_000).unref?.();
    // eslint-disable-next-line no-console
    console.log(`[instrumentation] kc-events-poll started (every ${interval}ms)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[instrumentation] kc-events-poll init failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // KC localization seed — OPT-IN przez DASHBOARD_PUSH_KC_TEMPLATES=true.
  // Domyślnie wyłączone, żeby NIE nadpisywać manualnych zmian admina
  // w KC Admin Console (Realm Settings → Localization). Admin uruchamia
  // tylko gdy chce zsynchronizować z lib/email/kc-templates.ts.
  if (process.env.DASHBOARD_PUSH_KC_TEMPLATES === "true") {
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
  }

  // Initial Directus push — branding + szablony + app catalog z tagami
  // (tagi NIE są nadpisywane jeśli admin już je edytował w Directusie).
  try {
    const { isConfigured, ensureCollection, upsertItem, listItems, deleteItem, COLLECTION_SPECS } =
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

      // Certyfikaty mTLS mirror
      const { listCertificates } = await import("@/lib/persistence");
      const certs = await listCertificates().catch(() => []);
      let certsPushed = 0;
      for (const c of certs) {
        await upsertItem("mp_certificates_cms", c.id, {
          id: c.id,
          subject: c.subject,
          email: c.email,
          roles: c.roles ?? [],
          serial_number: c.serialNumber,
          not_after: c.notAfter,
          issued_at: c.issuedAt,
          revoked_at: c.revokedAt ?? null,
          revoked_reason: c.revokedReason ?? null,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        certsPushed++;
      }

      // Blokady IP mirror
      const { withClient } = await import("@/lib/db");
      let blocksPushed = 0;
      try {
        await withClient(async (cli) => {
          const r = await cli.query<{
            ip: string;
            reason: string;
            blocked_at: Date;
            expires_at: Date | null;
            blocked_by: string;
            source: string;
            attempts: number;
            country: string | null;
          }>(
            `SELECT ip, reason, blocked_at, expires_at, blocked_by, source,
                    attempts, country FROM mp_blocked_ips
              WHERE expires_at IS NULL OR expires_at > now()
              ORDER BY blocked_at DESC LIMIT 200`,
          );
          for (const row of r.rows) {
            await upsertItem("mp_blocked_ips_cms", row.ip, {
              ip: row.ip,
              reason: row.reason,
              blocked_at: row.blocked_at.toISOString(),
              expires_at: row.expires_at ? row.expires_at.toISOString() : null,
              blocked_by: row.blocked_by,
              source: row.source,
              attempts: row.attempts,
              country: row.country,
              synced_at: new Date().toISOString(),
            }).catch(() => undefined);
            blocksPushed++;
          }
        });
      } catch {
        // mp_blocked_ips może nie istnieć — fresh DB
      }

      // OVH config (bez secrets)
      try {
        const { getOvhConfig } = await import("@/lib/email/db");
        const ovh = await getOvhConfig();
        await upsertItem("mp_ovh_config_cms", "default", {
          id: "default",
          endpoint: ovh.endpoint ?? "",
          app_key_preview: ovh.appKey ? `${ovh.appKey.slice(0, 8)}…` : "",
          consumer_key_preview: ovh.consumerKey
            ? `${ovh.consumerKey.slice(0, 8)}…`
            : "",
          configured: !!(ovh.appKey && ovh.appSecret && ovh.consumerKey),
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
      } catch {
        // OVH config może być pusty
      }

      // Panele certyfikatowe (hardcoded — domeny niezmienne).
      // Documenso pozostaje przez SSO w "Mp App Catalog" — nie ma osobnego
      // panelu mTLS na dokumenty.
      const PANELS = [
        {
          slug: "sprzedawca",
          label: "Panel Sprzedawcy",
          domain: "panelsprzedawcy.myperformance.pl",
          description: "Oferty, zamówienia, klienci. Wymaga certyfikatu mTLS.",
          requiredRole: "sprzedawca",
          icon: "Briefcase",
          sort: 1,
        },
        {
          slug: "serwisant",
          label: "Panel Serwisanta",
          domain: "panelserwisanta.myperformance.pl",
          description: "Zgłoszenia serwisowe i naprawy.",
          requiredRole: "serwisant",
          icon: "Wrench",
          sort: 2,
        },
        {
          slug: "kierowca",
          label: "Panel Kierowcy",
          domain: "panelkierowcy.myperformance.pl",
          description: "Trasy, dostawy, pojazdy.",
          requiredRole: "kierowca",
          icon: "Truck",
          sort: 3,
        },
      ];
      // Sprawdź jakie panels już ma admin edited — preserve label/description
      const existingPanels = await listItems<{
        slug: string;
        label?: string;
        description?: string;
      }>("mp_panels_cms", { limit: 50 }).catch(() => []);
      const existingPanelMap = new Map(existingPanels.map((p) => [p.slug, p]));
      // Usuń orphan panele które już nie istnieją w PANELS (np. dokumenty
      // został usunięty — używamy Documenso przez SSO zamiast osobnego
      // panelu certyfikatowego).
      const validSlugs = new Set(PANELS.map((p) => p.slug));
      for (const p of existingPanels) {
        if (!validSlugs.has(p.slug)) {
          await deleteItem("mp_panels_cms", p.slug).catch(() => undefined);
        }
      }

      // Seed grup targetowych — 8 wstępnych kategorii. Idempotent: tylko
      // gdy collection pusta (admin może później edytować/dodawać własne).
      try {
        const existingGroups = await listItems<{ id: string }>(
          "mp_target_groups",
          { limit: 1 },
        ).catch(() => []);
        if (existingGroups.length === 0) {
          const seedGroups = [
            { code: "UCH_SAM", label: "Uchwyty samochodowe", unit: "szt", sort: 10 },
            { code: "GWA_SZK", label: "Gwarancja na szkło", unit: "szt", sort: 20 },
            { code: "STA_LAD", label: "Stacje ładujące", unit: "szt", sort: 30 },
            { code: "PAS_SEL", label: "Paski i selfiesticki", unit: "szt", sort: 40 },
            { code: "PWR_IND", label: "Powerbanki indukcyjne", unit: "szt", sort: 50 },
            { code: "ZAB_OBJ", label: "Zabezpieczenia obiektywów", unit: "szt", sort: 60 },
            { code: "CZY_TEL", label: "Czyszczenie telefonu", unit: "szt", sort: 70 },
            { code: "PRZ_SER", label: "Przyjęcia serwisowe", unit: "szt", sort: 80 },
          ];
          for (const g of seedGroups) {
            await upsertItem("mp_target_groups", g.code, {
              code: g.code,
              label: g.label,
              unit: g.unit,
              sort: g.sort,
              enabled: true,
            }).catch(() => undefined);
          }
          // eslint-disable-next-line no-console
          console.log(
            `[instrumentation] seeded ${seedGroups.length} target groups`,
          );
        }
      } catch {
        // Directus może być chwilowo niedostępny — następny start spróbuje
      }

      let panelsPushed = 0;
      for (const p of PANELS) {
        const existing = existingPanelMap.get(p.slug);
        await upsertItem("mp_panels_cms", p.slug, {
          slug: p.slug,
          label: existing?.label ?? p.label,
          domain: p.domain,
          description: existing?.description ?? p.description,
          required_role: p.requiredRole,
          mtls_required: true,
          icon: p.icon,
          sort: p.sort,
          enabled: true,
          synced_at: new Date().toISOString(),
        }).catch(() => undefined);
        panelsPushed++;
      }

      // Seed default repair types do mp_repair_types (idempotent).
      let repairsCreated = 0;
      try {
        const { seedDefaultRepairTypes } = await import("@/lib/repair-types");
        const res = await seedDefaultRepairTypes();
        repairsCreated = res.created;
      } catch {
        /* ignore — table może nie istnieć przy pierwszym deploy */
      }

      // eslint-disable-next-line no-console
      console.log(
        `[instrumentation] Directus initial push: branding + ${tpls.length} templates + ${appsPushed} apps + ${areasPushed} areas + ${notifPushed} notif + ${layoutsPushed} layouts + ${smtpsPushed} smtps + ${certsPushed} certs + ${blocksPushed} blocks + 1 ovh + ${panelsPushed} panels + ${repairsCreated} repair types`,
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

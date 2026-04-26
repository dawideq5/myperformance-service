"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Compass, Lightbulb, Mail, Save, ShieldAlert } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Skeleton,
  useToast,
} from "@/components/ui";
import { usePreferences } from "@/hooks/usePreferences";
import type { NotifEventKey } from "@/lib/preferences";

const CATEGORY_ORDER = ["security", "account", "apps", "admin"] as const;
const CATEGORY_LABELS: Record<string, { title: string; desc: string }> = {
  security: {
    title: "Bezpieczeństwo",
    desc: "Logowania, 2FA, brute-force, zmiany hasła. Zalecamy zostawić email-y włączone.",
  },
  account: {
    title: "Konto",
    desc: "Role, certyfikaty, status konta.",
  },
  apps: {
    title: "Aplikacje",
    desc: "Documenso, Moodle, Chatwoot — codzienna praca.",
  },
  admin: {
    title: "Administracja",
    desc: "Snapshoty VPS, backupy, zdarzenia bezpieczeństwa. Widoczne dla adminów.",
  },
};

type Channel = "inApp" | "email";

export function PreferencesTab() {
  const { prefs, catalog, loading, error, update } = usePreferences();
  const toast = useToast();
  const [draftHints, setDraftHints] = useState<boolean | null>(null);
  const [draftInApp, setDraftInApp] = useState<Record<string, boolean>>({});
  const [draftEmail, setDraftEmail] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefs && catalog) {
      setDraftHints(prefs.hintsEnabled);
      const inApp: Record<string, boolean> = {};
      const email: Record<string, boolean> = {};
      for (const [k, def] of Object.entries(catalog)) {
        const ev = k as NotifEventKey;
        inApp[ev] = prefs.notifInApp[ev] ?? def.defaultInApp;
        email[ev] = prefs.notifEmail[ev] ?? def.defaultEmail;
      }
      setDraftInApp(inApp);
      setDraftEmail(email);
    }
  }, [prefs, catalog]);

  const grouped = useMemo(() => {
    if (!catalog) return null;
    const map: Record<string, Array<[NotifEventKey, (typeof catalog)[NotifEventKey]]>> = {};
    for (const [k, def] of Object.entries(catalog)) {
      const cat = def.category;
      (map[cat] ??= []).push([k as NotifEventKey, def]);
    }
    return map;
  }, [catalog]);

  const dirty = useMemo(() => {
    if (!prefs || !catalog) return false;
    if (draftHints !== prefs.hintsEnabled) return true;
    for (const k of Object.keys(catalog)) {
      const ev = k as NotifEventKey;
      const def = catalog[ev];
      if (
        draftInApp[ev] !== (prefs.notifInApp[ev] ?? def.defaultInApp) ||
        draftEmail[ev] !== (prefs.notifEmail[ev] ?? def.defaultEmail)
      ) {
        return true;
      }
    }
    return false;
  }, [prefs, catalog, draftHints, draftInApp, draftEmail]);

  async function save() {
    if (!catalog) return;
    setSaving(true);
    try {
      const inApp: Record<string, boolean> = {};
      const email: Record<string, boolean> = {};
      for (const [k, def] of Object.entries(catalog)) {
        const ev = k as NotifEventKey;
        if (draftInApp[ev] !== def.defaultInApp) inApp[ev] = draftInApp[ev];
        if (draftEmail[ev] !== def.defaultEmail) email[ev] = draftEmail[ev];
      }
      await update({
        hintsEnabled: draftHints ?? true,
        notifInApp: inApp,
        notifEmail: email,
      });
      toast.success("Zapisano preferencje");
    } catch (err) {
      toast.error(
        "Nie udało się zapisać",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleAll(channel: Channel, value: boolean) {
    if (!catalog) return;
    const next: Record<string, boolean> = {};
    for (const k of Object.keys(catalog)) next[k] = value;
    if (channel === "inApp") setDraftInApp(next);
    else setDraftEmail(next);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !prefs || !catalog) {
    return (
      <Alert tone="error" title="Nie udało się załadować preferencji">
        <p>{error ?? "Brak danych."}</p>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card>
        <CardHeader
          icon={<Lightbulb className="w-5 h-5 text-[var(--accent)]" />}
          title="Wskazówki i przewodnik"
          description="Karty wyjaśniające + intro.js tour po kluczowych panelach. Zamknięcie X chowa do następnego F5."
        />
        <label className="flex items-center justify-between gap-3 mt-4 p-3 rounded-xl border border-[var(--border-subtle)] cursor-pointer">
          <div>
            <div className="text-sm font-medium">Pokazuj wskazówki</div>
            <div className="text-xs text-[var(--text-muted)]">
              Wyłącz, jeśli już dobrze znasz interfejs.
            </div>
          </div>
          <input
            type="checkbox"
            checked={draftHints ?? true}
            onChange={(e) => setDraftHints(e.target.checked)}
            className="w-5 h-5 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/50"
          />
        </label>

        <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-subtle)]">
          <div>
            <div className="text-sm font-medium">Przewodnik po koncie</div>
            <div className="text-xs text-[var(--text-muted)]">
              Pokażemy klika kroków: bezpieczeństwo, sesje, integracje, preferencje.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Compass className="w-4 h-4" />}
            onClick={async () => {
              const { runTour } = await import("@/lib/onboarding/runner");
              await runTour("account");
            }}
          >
            Uruchom
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Bell className="w-5 h-5 text-[var(--accent)]" />}
          title="Powiadomienia"
          description="Per-zdarzenie kontrola nad in-app (toast/badge) i email-em. Domyślne polityki opatrzone gwiazdką."
        />

        <div className="flex flex-wrap items-center gap-2 mt-4 mb-2 text-xs text-[var(--text-muted)]">
          <span>Zaznacz wszystko:</span>
          <button
            type="button"
            onClick={() => toggleAll("inApp", true)}
            className="px-2 py-1 rounded-md hover:bg-[var(--bg-surface)]"
          >
            <Bell className="w-3 h-3 inline mr-1" />
            in-app
          </button>
          <button
            type="button"
            onClick={() => toggleAll("inApp", false)}
            className="px-2 py-1 rounded-md hover:bg-[var(--bg-surface)]"
          >
            ✕ in-app
          </button>
          <button
            type="button"
            onClick={() => toggleAll("email", true)}
            className="px-2 py-1 rounded-md hover:bg-[var(--bg-surface)]"
          >
            <Mail className="w-3 h-3 inline mr-1" />
            email
          </button>
          <button
            type="button"
            onClick={() => toggleAll("email", false)}
            className="px-2 py-1 rounded-md hover:bg-[var(--bg-surface)]"
          >
            ✕ email
          </button>
        </div>

        <div className="mt-2 divide-y divide-[var(--border-subtle)]">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped?.[cat];
            if (!items || items.length === 0) return null;
            const meta = CATEGORY_LABELS[cat];
            return (
              <section key={cat} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-3">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    {cat === "security" && (
                      <ShieldAlert className="w-4 h-4 text-[var(--accent)]" />
                    )}
                    {meta?.title ?? cat}
                  </h3>
                  {meta?.desc && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {meta.desc}
                    </p>
                  )}
                </div>
                <ul className="space-y-2">
                  {items.map(([ev, def]) => (
                    <li
                      key={ev}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      <div>
                        <div className="text-sm">{def.label}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono">
                          {ev}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftInApp[ev] ?? def.defaultInApp}
                          onChange={(e) =>
                            setDraftInApp((s) => ({
                              ...s,
                              [ev]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                        <span className="flex items-center gap-1">
                          <Bell className="w-3.5 h-3.5" />
                          {def.defaultInApp && (
                            <span className="text-[var(--text-muted)]">*</span>
                          )}
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftEmail[ev] ?? def.defaultEmail}
                          onChange={(e) =>
                            setDraftEmail((s) => ({
                              ...s,
                              [ev]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/50"
                        />
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          {def.defaultEmail && (
                            <span className="text-[var(--text-muted)]">*</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <p className="text-xs text-[var(--text-muted)]">
            * = zalecane domyślnie. Krytyczne alerty bezpieczeństwa zostawiamy
            włączone niezależnie od wyboru.
          </p>
          <Button
            onClick={save}
            disabled={!dirty || saving}
            leftIcon={<Save className="w-4 h-4" />}
            variant="primary"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Palette, Save, Sparkles } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Input,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import type { Branding, SmtpProfileRow } from "./types";

export function BrandingPanel() {
  const [data, setData] = useState<Branding | null>(null);
  const [draft, setDraft] = useState<Partial<Branding>>({});
  const [busy, setBusy] = useState(false);
  const [propagating, setPropagating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [smtpProfiles, setSmtpProfiles] = useState<SmtpProfileRow[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<{ branding: Branding }>(
        "/api/admin/email/branding",
      );
      setData(r.branding);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
    try {
      const r = await api.get<{ profiles: SmtpProfileRow[] }>(
        "/api/admin/email/smtp-profiles",
      );
      setSmtpProfiles(r.profiles);
    } catch {
      // non-blocking — branding może działać bez listy profili
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const r = await api.put<{ branding: Branding }, Partial<Branding>>(
        "/api/admin/email/branding",
        draft,
      );
      setData(r.branding);
      setDraft({});
      setNotice('Branding zapisany. Kliknij „Propaguj" aby wysłać do apek.');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function propagate() {
    if (
      !confirm(
        "Propagacja zaktualizuje envy w 6 aplikacjach. Apki Documenso + Dashboard wymagają redeployu (~5 min). Kontynuować?",
      )
    )
      return;
    setPropagating(true);
    setError(null);
    try {
      await api.post("/api/admin/email/branding/propagate", {
        applyRedeploy: true,
      });
      setNotice(
        "Propagacja zakończona. Apki podchwycą zmiany w ciągu kilku minut.",
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Propagate failed",
      );
    } finally {
      setPropagating(false);
    }
  }

  if (!data) {
    return (
      <Card padding="lg">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie…
          </div>
        )}
      </Card>
    );
  }

  const merged = { ...data, ...draft };
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card padding="lg">
        <CardHeader
          icon={<Palette className="w-6 h-6 text-[var(--accent)]" />}
          title="Globalne dane marki"
          description="Te zmienne lecą jako env do każdej apki. Apka renderuje je w mailach i UI."
        />
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Input
            label="Nazwa marki *"
            value={merged.brandName ?? ""}
            onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
          />
          <Input
            label="URL strony"
            value={merged.brandUrl ?? ""}
            onChange={(e) => setDraft({ ...draft, brandUrl: e.target.value })}
          />
          <Input
            label="Logo URL"
            value={merged.brandLogoUrl ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, brandLogoUrl: e.target.value })
            }
          />
          <Input
            label="Kolor (hex)"
            value={merged.primaryColor ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, primaryColor: e.target.value })
            }
          />
          <Input
            label="Support email"
            value={merged.supportEmail ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, supportEmail: e.target.value })
            }
          />
          <Input
            label="Pełna nazwa firmy"
            value={merged.legalName ?? ""}
            onChange={(e) => setDraft({ ...draft, legalName: e.target.value })}
          />
          <Input
            label="From display"
            value={merged.fromDisplay ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, fromDisplay: e.target.value })
            }
          />
          <Input
            label="Reply-To"
            value={merged.replyTo ?? ""}
            onChange={(e) => setDraft({ ...draft, replyTo: e.target.value })}
          />
          <div className="md:col-span-2">
            <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
              Domyślny profil SMTP (per branding)
            </label>
            <select
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm"
              value={merged.defaultSmtpProfileSlug ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultSmtpProfileSlug: e.target.value || null,
                })
              }
            >
              <option value="">
                — użyj globalnego is_default (z tabeli profili) —
              </option>
              {smtpProfiles.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              Jeśli ustawione — <code>sendMail</code> bez <code>profileSlug</code>
              używa tego profilu. Edytuj profile w zakładce „Profile SMTP”.
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2 flex-wrap">
          <Button
            onClick={save}
            loading={busy}
            disabled={!dirty}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {dirty ? "Zapisz" : "Brak zmian"}
          </Button>
          <Button
            onClick={propagate}
            loading={propagating}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            Propaguj do aplikacji
          </Button>
        </div>
      </Card>
    </div>
  );
}

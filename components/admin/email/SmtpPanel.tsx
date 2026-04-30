"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Info, Loader2, Save, Send, X } from "lucide-react";

import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import { SmtpTestDialog } from "./parts/SmtpTestDialog";
import type { OvhMailboxBrief, SmtpConfigFull } from "./types";

export function SmtpPanel() {
  const [configs, setConfigs] = useState<SmtpConfigFull[]>([]);
  const [editing, setEditing] = useState<Partial<SmtpConfigFull> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showOvhPicker, setShowOvhPicker] = useState(false);
  const [ovhDomains, setOvhDomains] = useState<
    { name: string; mailboxCount: number }[]
  >([]);
  const [ovhMailboxes, setOvhMailboxes] = useState<OvhMailboxBrief[]>([]);
  const [ovhLoading, setOvhLoading] = useState(false);
  const [selectedOvhDomain, setSelectedOvhDomain] = useState<string | null>(
    null,
  );

  async function loadOvhMailboxes(domain: string) {
    setSelectedOvhDomain(domain);
    setOvhLoading(true);
    try {
      const r = await api.get<{ accounts: OvhMailboxBrief[] }>(
        `/api/admin/email/ovh/mailboxes?domain=${encodeURIComponent(domain)}`,
      );
      setOvhMailboxes(r.accounts);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Mailboxes load failed",
      );
    } finally {
      setOvhLoading(false);
    }
  }

  function pickOvhMailbox(mb: OvhMailboxBrief) {
    const localPart = mb.email.split("@")[0];
    const aliasSuggest = `ovh-${mb.domain.replace(/\./g, "-")}-${localPart}`;
    setEditing({
      alias: aliasSuggest,
      label: `OVH — ${mb.email}`,
      smtpHost: "ssl0.ovh.net",
      smtpPort: 465,
      useTls: true,
      smtpUser: mb.email,
      smtpPassword: "",
      fromEmail: mb.email,
      fromDisplay: "MyPerformance",
      replyTo: mb.email,
      isDefault: false,
    });
    setShowOvhPicker(false);
    setSelectedOvhDomain(null);
    setOvhMailboxes([]);
  }

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ configs: SmtpConfigFull[] }>(
        "/api/admin/email/smtp-configs",
      );
      setConfigs(r.configs);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/admin/email/smtp-configs", editing);
      setNotice("Zapisane.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Aliasy SMTP (np. <code>transactional</code>, <code>marketing</code>)
            to nazwy logiczne. Każdy szablon przypisujesz do aliasa — dzięki
            temu możesz zmienić skrzynkę nadawczą dla wszystkich maili tego typu
            w jednym miejscu.
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-2">
        {configs.map((c) => (
          <Card key={c.id} padding="md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {c.label}
                  {c.isDefault && <Badge tone="success">domyślny</Badge>}
                </div>
                <code className="text-[10px] text-[var(--text-muted)]">
                  {c.alias} · {c.smtpHost}:{c.smtpPort} · {c.fromEmail}
                </code>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                Edytuj
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            setShowOvhPicker(true);
            setOvhLoading(true);
            try {
              const r = await api.get<{
                domains: { name: string; mailboxCount: number }[];
              }>("/api/admin/email/ovh/domains");
              setOvhDomains(r.domains);
              if (r.domains.length === 1) {
                await loadOvhMailboxes(r.domains[0].name);
              }
            } catch (err) {
              setError(
                err instanceof ApiRequestError
                  ? `Nie mogę pobrać domen OVH: ${err.message}`
                  : "OVH load failed",
              );
            } finally {
              setOvhLoading(false);
            }
          }}
        >
          + Skrzynka OVH (z API live)
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setEditing({
              alias: "",
              label: "",
              smtpHost: "smtp-iut9wf1rz9ey54g7lbkje0je",
              smtpPort: 25,
              useTls: false,
              fromEmail: "noreply@myperformance.pl",
              fromDisplay: "MyPerformance",
              isDefault: false,
            })
          }
        >
          + Postal (wewnętrzny)
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setEditing({
              alias: "",
              label: "",
              smtpHost: "",
              smtpPort: 587,
              useTls: false,
              smtpUser: "",
              smtpPassword: "",
              fromEmail: "",
              fromDisplay: "MyPerformance",
              isDefault: false,
            })
          }
        >
          + Inny serwer SMTP
        </Button>
      </div>

      {editing && (
        <Card padding="lg" className="border-[var(--accent)]">
          <h3 className="text-sm font-semibold mb-3">
            {editing.alias ? `Edycja: ${editing.alias}` : "Nowa konfiguracja"}
          </h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Input
              label="Alias (slug, identyfikator)"
              value={editing.alias ?? ""}
              onChange={(e) => setEditing({ ...editing, alias: e.target.value })}
              placeholder="transactional"
            />
            <Input
              label="Etykieta (ludzka nazwa)"
              value={editing.label ?? ""}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              placeholder="Transactional (Postal)"
            />
            <Input
              label="SMTP host"
              value={editing.smtpHost ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, smtpHost: e.target.value })
              }
            />
            <Input
              label="SMTP port"
              type="number"
              value={String(editing.smtpPort ?? 25)}
              onChange={(e) =>
                setEditing({ ...editing, smtpPort: Number(e.target.value) })
              }
            />
            <Input
              label="SMTP user"
              value={editing.smtpUser ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, smtpUser: e.target.value })
              }
            />
            <Input
              label="SMTP password (zostaw puste żeby nie zmieniać)"
              type="password"
              value={
                editing.smtpPassword === "***" ? "" : editing.smtpPassword ?? ""
              }
              onChange={(e) =>
                setEditing({ ...editing, smtpPassword: e.target.value })
              }
              placeholder={
                editing.smtpPassword === "***" ? "(istniejące hasło)" : ""
              }
            />
            <Input
              label="From email (adres nadawcy)"
              value={editing.fromEmail ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromEmail: e.target.value })
              }
            />
            <Input
              label="From display (nazwa nadawcy)"
              value={editing.fromDisplay ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromDisplay: e.target.value })
              }
            />
            <Input
              label="Reply-To (opcjonalny)"
              value={editing.replyTo ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, replyTo: e.target.value })
              }
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={editing.useTls ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, useTls: e.target.checked })
                }
              />
              Wymaga TLS (zazwyczaj port 465)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefault ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
              />
              Ustaw jako domyślny (używany dla szablonów bez przypisanego SMTP)
            </label>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button
              onClick={save}
              loading={busy}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Zapisz
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowTest(true)}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Testuj połączenie i wyślij test
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Anuluj
            </Button>
          </div>
          {editing.smtpHost?.includes("ovh.net") && (
            <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] p-3">
              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-400" />
                Konfiguracja OVH — referencja
              </h4>
              <div className="grid md:grid-cols-2 gap-3 text-[11px] text-[var(--text-muted)]">
                <div>
                  <div className="font-semibold text-[var(--text-main)] mb-1">
                    SMTP (wysyłka)
                  </div>
                  <div>
                    Host: <code>ssl0.ovh.net</code> lub{" "}
                    <code>smtp.mail.ovh.net</code>
                  </div>
                  <div>
                    Port: <code>465</code> (SSL/TLS)
                  </div>
                  <div>User: pełen adres email</div>
                  <div>Hasło: ustawione dla skrzynki w OVH</div>
                </div>
                <div>
                  <div className="font-semibold text-[var(--text-main)] mb-1">
                    IMAP (odbiór)
                  </div>
                  <div>
                    Host: <code>ssl0.ovh.net</code> lub{" "}
                    <code>imap.mail.ovh.net</code>
                  </div>
                  <div>
                    Port: <code>993</code> (SSL/TLS)
                  </div>
                  <div className="mt-2 font-semibold text-[var(--text-main)]">
                    POP3
                  </div>
                  <div>
                    Host: <code>ssl0.ovh.net</code> lub{" "}
                    <code>pop3.mail.ovh.net</code>
                  </div>
                  <div>
                    Port: <code>995</code> (SSL/TLS)
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {showTest && editing && (
        <SmtpTestDialog config={editing} onClose={() => setShowTest(false)} />
      )}

      {showOvhPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <Card
            padding="lg"
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Code2 className="w-5 h-5" /> Wybierz skrzynkę OVH
              </h3>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<X className="w-4 h-4" />}
                onClick={() => {
                  setShowOvhPicker(false);
                  setSelectedOvhDomain(null);
                  setOvhMailboxes([]);
                }}
              >
                Zamknij
              </Button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Lista pobierana <strong>live z OVH API</strong>. Kliknij skrzynkę
              żeby auto-wypełnić formularz SMTP. Hasło skrzynki musisz wpisać
              ręcznie (OVH nie udostępnia haseł przez API).
            </p>

            {ovhLoading && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Pobieram z OVH…
              </div>
            )}

            {!selectedOvhDomain && ovhDomains.length > 0 && (
              <div>
                <h4 className="text-xs uppercase text-[var(--text-muted)] mb-2">
                  Wybierz domenę
                </h4>
                <div className="grid gap-1.5">
                  {ovhDomains.map((d) => (
                    <button
                      key={d.name}
                      type="button"
                      onClick={() => loadOvhMailboxes(d.name)}
                      className="text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface)]"
                    >
                      <div className="font-medium text-sm">{d.name}</div>
                      <Badge tone="neutral">{d.mailboxCount} skrzynk(i)</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedOvhDomain && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs uppercase text-[var(--text-muted)]">
                    Skrzynki w {selectedOvhDomain}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedOvhDomain(null);
                      setOvhMailboxes([]);
                    }}
                  >
                    ← Wróć do domen
                  </Button>
                </div>
                <div className="grid gap-1.5">
                  {ovhMailboxes.map((mb) => (
                    <button
                      key={mb.email}
                      type="button"
                      onClick={() => pickOvhMailbox(mb)}
                      disabled={mb.isBlocked}
                      className="text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-mono text-sm">{mb.email}</div>
                      <div className="flex gap-1">
                        {mb.isBlocked && (
                          <Badge tone="danger">zablokowana</Badge>
                        )}
                        <Badge tone={mb.state === "ok" ? "success" : "neutral"}>
                          {mb.state}
                        </Badge>
                      </div>
                    </button>
                  ))}
                  {ovhMailboxes.length === 0 && !ovhLoading && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Brak skrzynek w tej domenie.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Info,
  Mail,
  Plus,
  Save,
  Send,
  Server,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  Input,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import type { SmtpProfileRow } from "./types";

const EMPTY_DRAFT: Partial<SmtpProfileRow> = {
  slug: "",
  name: "",
  description: "",
  host: "smtp-iut9wf1rz9ey54g7lbkje0je",
  port: 25,
  secure: false,
  username: "",
  passwordRef: "",
  fromAddress: "",
  fromName: "MyPerformance",
  replyTo: "",
  postalOrgName: "",
  postalServerName: "",
  isDefault: false,
};

export function SmtpProfilesPanel() {
  const [profiles, setProfiles] = useState<SmtpProfileRow[]>([]);
  const [editing, setEditing] = useState<Partial<SmtpProfileRow> | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testProfile, setTestProfile] = useState<SmtpProfileRow | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; messageId: string }
    | { ok: false; error: string }
    | null
  >(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.get<{ profiles: SmtpProfileRow[] }>(
        "/api/admin/email/smtp-profiles",
      );
      setProfiles(r.profiles);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(p: SmtpProfileRow) {
    setEditing({ ...p });
    setEditingIsNew(false);
    setPasswordInput("");
  }

  function startNew() {
    setEditing({ ...EMPTY_DRAFT });
    setEditingIsNew(true);
    setPasswordInput("");
  }

  function cancelEdit() {
    setEditing(null);
    setEditingIsNew(false);
    setPasswordInput("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        slug: editing.slug,
        name: editing.name,
        description: editing.description ?? null,
        host: editing.host,
        port: Number(editing.port ?? 25),
        secure: !!editing.secure,
        username: editing.username,
        passwordRef: editing.passwordRef ?? null,
        fromAddress: editing.fromAddress,
        fromName: editing.fromName,
        replyTo: editing.replyTo ?? null,
        postalOrgName: editing.postalOrgName ?? null,
        postalServerName: editing.postalServerName ?? null,
        isDefault: !!editing.isDefault,
      };
      // passwordPlain semantics: empty string = "leave alone", null = clear,
      // string = set. UI input is empty by default to avoid accidentally
      // overwriting the existing DB password.
      if (passwordInput.length > 0) {
        payload.passwordPlain = passwordInput;
      }
      if (editingIsNew) {
        await api.post("/api/admin/email/smtp-profiles", payload);
      } else {
        await api.patch(
          `/api/admin/email/smtp-profiles/${encodeURIComponent(
            String(editing.slug),
          )}`,
          payload,
        );
      }
      setNotice("Profil zapisany.");
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function setAsDefault(p: SmtpProfileRow) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(
        `/api/admin/email/smtp-profiles/${encodeURIComponent(p.slug)}`,
        { isDefault: true },
      );
      setNotice(`Profil "${p.name}" ustawiony jako domyślny.`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Set-default failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: SmtpProfileRow) {
    if (p.isDefault) {
      setError("Nie można usunąć profilu domyślnego.");
      return;
    }
    if (!confirm(`Usunąć profil "${p.name}" (${p.slug})?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.delete(
        `/api/admin/email/smtp-profiles/${encodeURIComponent(p.slug)}`,
      );
      setNotice("Profil usunięty.");
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function openTest(p: SmtpProfileRow) {
    setTestProfile(p);
    setTestTo("");
    setTestResult(null);
  }

  async function runTest() {
    if (!testProfile || !testTo) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const r = await api.post<
        { ok: true; messageId: string } | { ok: false; error: string },
        { to: string }
      >(
        `/api/admin/email/smtp-profiles/${encodeURIComponent(
          testProfile.slug,
        )}/test`,
        { to: testTo },
      );
      setTestResult(r);
    } catch (err) {
      setTestResult({
        ok: false,
        error:
          err instanceof ApiRequestError ? err.message : "Test send failed",
      });
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex gap-3 items-start">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--text-muted)]">
            Profile SMTP per marka. Każdy profil to host + auth + adres
            nadawcy. <code>sendMail</code> wybiera profil po slug — lub
            domyślny ustawiony tutaj. Hasła pobieramy preferowanie z env (pole{" "}
            <strong>passwordRef</strong>); fallback to wpisanie hasła w polu{" "}
            <strong>passwordPlain</strong> (przechowywane w DB plaintext —{" "}
            <em>encryption to osobny ticket</em>).
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-2">
        {profiles.map((p) => (
          <Card key={p.id} padding="md">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium flex items-center gap-2">
                  {p.name}
                  {p.isDefault && (
                    <Badge tone="success">
                      <Star className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                      domyślny
                    </Badge>
                  )}
                  {p.hasPasswordPlain && !p.passwordRef && (
                    <Badge tone="warning">
                      <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                      hasło w DB (plaintext)
                    </Badge>
                  )}
                </div>
                <code className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                  {p.slug} · {p.host}:{p.port}
                  {p.secure ? " (TLS)" : ""} · user={p.username} ·{" "}
                  {p.fromAddress}
                </code>
                {p.description && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">
                    {p.description}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!p.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Star className="w-4 h-4" />}
                    onClick={() => setAsDefault(p)}
                    disabled={busy}
                  >
                    Ustaw domyślny
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Send className="w-4 h-4" />}
                  onClick={() => openTest(p)}
                >
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(p)}
                >
                  Edytuj
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 className="w-4 h-4" />}
                  onClick={() => remove(p)}
                  disabled={p.isDefault}
                  title={
                    p.isDefault
                      ? "Nie można usunąć profilu domyślnego"
                      : "Usuń profil"
                  }
                >
                  Usuń
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {profiles.length === 0 && (
          <Card padding="lg">
            <div className="text-sm text-[var(--text-muted)]">
              Brak profili SMTP. Pre-seed (myperformance + zlecenieserwisowe)
              powinien był je wstawić — odśwież stronę lub kliknij „+ Nowy
              profil”.
            </div>
          </Card>
        )}
      </div>

      <div>
        <Button onClick={startNew} leftIcon={<Plus className="w-4 h-4" />}>
          Nowy profil
        </Button>
      </div>

      {editing && (
        <Card padding="lg" className="border-[var(--accent)]">
          <CardHeader
            icon={<Server className="w-5 h-5 text-[var(--accent)]" />}
            title={
              editingIsNew
                ? "Nowy profil SMTP"
                : `Edycja profilu: ${editing.slug}`
            }
            description="Wszystkie pola są obowiązkowe poza description / replyTo / passwordPlain. Slug to identyfikator (kebab-case / lowercase) używany w API i w sendMail({ profileSlug })."
          />
          <div className="grid md:grid-cols-2 gap-3 mt-5">
            <Input
              label="Slug *"
              value={editing.slug ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, slug: e.target.value })
              }
              placeholder="myperformance"
              disabled={!editingIsNew}
            />
            <Input
              label="Nazwa (etykieta) *"
              value={editing.name ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
              placeholder="MyPerformance główna"
            />
            <div className="md:col-span-2">
              <Input
                label="Opis"
                value={editing.description ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </div>
            <Input
              label="SMTP host *"
              value={editing.host ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, host: e.target.value })
              }
            />
            <Input
              label="SMTP port *"
              type="number"
              value={String(editing.port ?? 25)}
              onChange={(e) =>
                setEditing({ ...editing, port: Number(e.target.value) })
              }
            />
            <Input
              label="Username *"
              value={editing.username ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, username: e.target.value })
              }
              placeholder="main"
            />
            <Input
              label="Password ref (env var name) — preferowane"
              value={editing.passwordRef ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, passwordRef: e.target.value })
              }
              placeholder="SMTP_PASSWORD"
            />
            <div className="md:col-span-2">
              <Input
                label="Password (zostaw puste żeby nie zmieniać; wpisanie nadpisze passwordPlain w DB)"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={
                  editing.hasPasswordPlain ? "(istniejące hasło w DB)" : ""
                }
              />
              <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-px" />
                <span>
                  Preferowane: wpisz nazwę env vara w polu „Password ref” i
                  ustaw sekret w env. Pole „Password” zapisuje hasło{" "}
                  <strong>plaintext w DB</strong> — encryption to osobny
                  ticket.
                </span>
              </div>
            </div>
            <Input
              label="From address *"
              value={editing.fromAddress ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromAddress: e.target.value })
              }
              placeholder="noreply@myperformance.pl"
            />
            <Input
              label="From name *"
              value={editing.fromName ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, fromName: e.target.value })
              }
              placeholder="MyPerformance"
            />
            <Input
              label="Reply-To (opcjonalnie)"
              value={editing.replyTo ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, replyTo: e.target.value })
              }
            />
            <Input
              label="Postal organisation name (referencja)"
              value={editing.postalOrgName ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, postalOrgName: e.target.value })
              }
            />
            <Input
              label="Postal server name (referencja)"
              value={editing.postalServerName ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, postalServerName: e.target.value })
              }
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={editing.secure ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, secure: e.target.checked })
                }
              />
              Wymaga TLS (zazwyczaj port 465)
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer mt-6">
              <input
                type="checkbox"
                checked={editing.isDefault ?? false}
                onChange={(e) =>
                  setEditing({ ...editing, isDefault: e.target.checked })
                }
              />
              Ustaw jako profil domyślny (jeden na całą instancję)
            </label>
          </div>
          <div className="mt-5 flex gap-2 flex-wrap">
            <Button
              onClick={save}
              loading={busy}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Zapisz
            </Button>
            <Button
              variant="ghost"
              onClick={cancelEdit}
              leftIcon={<X className="w-4 h-4" />}
            >
              Anuluj
            </Button>
          </div>
        </Card>
      )}

      <Dialog
        open={!!testProfile}
        onClose={() => setTestProfile(null)}
        size="md"
        title={
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Test wysyłki — {testProfile?.name}
          </div>
        }
        description={
          <span className="text-xs">
            Wyśle prawdziwą wiadomość przez profil{" "}
            <code>{testProfile?.slug}</code> z adresu{" "}
            <code>{testProfile?.fromAddress}</code>.
          </span>
        }
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setTestProfile(null)}>
              Zamknij
            </Button>
            <Button
              onClick={runTest}
              loading={testBusy}
              disabled={!testTo}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Wyślij test
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Adres odbiorcy"
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="ty@example.com"
          />
          {testResult && testResult.ok && (
            <Alert tone="success">
              Wysłano. messageId: <code>{testResult.messageId}</code>
            </Alert>
          )}
          {testResult && !testResult.ok && (
            <Alert tone="error">{testResult.error}</Alert>
          )}
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Edit2,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  PageShell,
  Textarea,
  useToast,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type {
  Announcement,
  AnnouncementInput,
  AnnouncementSeverity,
} from "@/lib/announcements";

interface Props {
  initialItems: Announcement[];
  userLabel?: string;
  userEmail?: string;
}

interface DraftAnnouncement {
  id?: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  activeFrom: string;
  activeUntil: string;
  isActive: boolean;
  sortOrder: number;
  requiresArea: string;
}

const SEVERITY_OPTIONS: Array<{
  value: AnnouncementSeverity;
  label: string;
  icon: typeof Info;
  badge: "neutral" | "success" | "warning" | "danger";
}> = [
  { value: "info", label: "Informacja", icon: Info, badge: "neutral" },
  {
    value: "success",
    label: "Sukces",
    icon: CheckCircle2,
    badge: "success",
  },
  {
    value: "warning",
    label: "Ostrzeżenie",
    icon: AlertTriangle,
    badge: "warning",
  },
  {
    value: "critical",
    label: "Krytyczne",
    icon: AlertCircle,
    badge: "danger",
  },
];

const SEVERITY_META = new Map(SEVERITY_OPTIONS.map((s) => [s.value, s]));

function emptyDraft(sortOrder: number): DraftAnnouncement {
  return {
    title: "",
    body: "",
    severity: "info",
    activeFrom: "",
    activeUntil: "",
    isActive: true,
    sortOrder,
    requiresArea: "",
  };
}

function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // "YYYY-MM-DDTHH:mm" — format dla <input type="datetime-local">.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function announcementToDraft(a: Announcement): DraftAnnouncement {
  return {
    id: a.id,
    title: a.title,
    body: a.body ?? "",
    severity: a.severity,
    activeFrom: isoToLocal(a.activeFrom),
    activeUntil: isoToLocal(a.activeUntil),
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    requiresArea: a.requiresArea ?? "",
  };
}

function draftToPayload(d: DraftAnnouncement): AnnouncementInput {
  return {
    title: d.title.trim(),
    body: d.body.trim() || null,
    severity: d.severity,
    activeFrom: localToIso(d.activeFrom),
    activeUntil: localToIso(d.activeUntil),
    isActive: d.isActive,
    sortOrder: d.sortOrder,
    requiresArea: d.requiresArea.trim() || null,
  };
}

export function AnnouncementsAdminClient({
  initialItems,
  userLabel,
  userEmail,
}: Props) {
  const toast = useToast();
  const [items, setItems] = useState<Announcement[]>(initialItems);
  const [draft, setDraft] = useState<DraftAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  const sorted = useMemo(
    () =>
      items
        .slice()
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            (b.activeFrom ?? "").localeCompare(a.activeFrom ?? ""),
        ),
    [items],
  );

  const nextSortOrder = useMemo(
    () => (items.length ? Math.max(...items.map((i) => i.sortOrder)) + 10 : 10),
    [items],
  );

  function startNew() {
    setDraft(emptyDraft(nextSortOrder));
  }

  function startEdit(a: Announcement) {
    setDraft(announcementToDraft(a));
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Brak tytułu", "Podaj tytuł komunikatu");
      return;
    }
    setBusy(true);
    try {
      const payload = draftToPayload(draft);
      if (draft.id) {
        const r = await fetch(`/api/admin/announcements/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        const updated = j.item as Announcement;
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        toast.success("Zaktualizowano", updated.title);
      } else {
        const r = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        const created = j.item as Announcement;
        setItems((prev) => [...prev, created]);
        toast.success("Dodano", created.title);
      }
      setDraft(null);
    } catch (e) {
      toast.error("Błąd zapisu", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(a: Announcement) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/announcements/${a.id}`, {
        method: "DELETE",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      toast.success("Usunięto", a.title);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(
        "Błąd usuwania",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      maxWidth="2xl"
      header={
        <AppHeader
          title="Komunikaty"
          backHref="/admin/config"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <div className="space-y-4">
        <Card padding="lg">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold mb-1">
                Komunikaty systemowe
              </h1>
              <p className="text-sm text-[var(--text-muted)] max-w-2xl">
                Wydarzenia widoczne dla użytkowników na dashboardzie. Aktywne
                w oknie czasowym (od/do) i z flagą is_active=true wyświetlają
                się jako duże kafelki z efektem glow w kolorze odpowiadającym
                wadze.
              </p>
            </div>
            <Button onClick={startNew} disabled={busy}>
              <Plus className="w-4 h-4" /> Dodaj komunikat
            </Button>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-surface)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Tytuł</th>
                  <th className="px-4 py-3 text-left font-semibold">Waga</th>
                  <th className="px-4 py-3 text-left font-semibold">Okno</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Sortowanie
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sorted.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-[var(--text-muted)]"
                    >
                      Brak komunikatów. Kliknij &bdquo;Dodaj komunikat&rdquo;.
                    </td>
                  </tr>
                )}
                {sorted.map((a) => {
                  const meta = SEVERITY_META.get(a.severity);
                  const Icon = meta?.icon ?? Info;
                  const windowLabel = formatWindow(
                    a.activeFrom,
                    a.activeUntil,
                  );
                  return (
                    <tr key={a.id} className="hover:bg-[var(--bg-surface)]/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-main)]">
                          {a.title}
                        </div>
                        {a.body && (
                          <div className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
                            {a.body}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta?.badge ?? "neutral"}>
                          <Icon className="w-3 h-3" />
                          {meta?.label ?? a.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                        {windowLabel}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {a.sortOrder}
                      </td>
                      <td className="px-4 py-3">
                        {a.isActive ? (
                          <Badge tone="success">Aktywny</Badge>
                        ) : (
                          <Badge tone="neutral">Wyłączony</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(a)}
                            disabled={busy}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(a)}
                            disabled={busy}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog
        open={!!draft}
        onClose={() => !busy && setDraft(null)}
        title={draft?.id ? "Edytuj komunikat" : "Nowy komunikat"}
        description="Komunikaty z is_active=true wyświetlają się na dashboardzie w wybranym oknie czasowym."
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Anuluj
            </Button>
            <Button onClick={save} disabled={busy}>
              {draft?.id ? "Zapisz zmiany" : "Dodaj"}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Tytuł">
              <Input
                value={draft.title}
                onChange={(e) =>
                  setDraft({ ...draft, title: e.target.value })
                }
                placeholder="np. Planowane prace serwisowe 27.04 21:00–23:00"
                autoFocus
              />
            </Field>
            <Field label="Treść (Markdown)">
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={4}
                placeholder="Szczegóły komunikatu — krótki tekst widoczny w kafelku"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Waga">
                <select
                  value={draft.severity}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      severity: e.target.value as AnnouncementSeverity,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-[var(--bg-surface)] border-[var(--border-subtle)] text-sm"
                >
                  {SEVERITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sortowanie (niższe = wyżej)">
                <Input
                  type="number"
                  min={0}
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sortOrder: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aktywne od">
                <Input
                  type="datetime-local"
                  value={draft.activeFrom}
                  onChange={(e) =>
                    setDraft({ ...draft, activeFrom: e.target.value })
                  }
                />
              </Field>
              <Field label="Aktywne do">
                <Input
                  type="datetime-local"
                  value={draft.activeUntil}
                  onChange={(e) =>
                    setDraft({ ...draft, activeUntil: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Wymaga area (opcjonalnie)">
              <Input
                value={draft.requiresArea}
                onChange={(e) =>
                  setDraft({ ...draft, requiresArea: e.target.value })
                }
                placeholder="np. infrastructure"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
                className="w-4 h-4 rounded"
              />
              <span>Aktywny (widoczny na dashboardzie w oknie czasowym)</span>
            </label>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onClose={() => !busy && setConfirmDelete(null)}
        title="Usunąć komunikat?"
        description={confirmDelete?.title}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={busy}
            >
              Anuluj
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && doDelete(confirmDelete)}
              disabled={busy}
            >
              Usuń
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">
          Operacja jest nieodwracalna.
        </p>
      </Dialog>
    </PageShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function formatWindow(from: string | null, until: string | null): string {
  const fmt = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("pl-PL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const a = fmt(from);
  const b = fmt(until);
  if (!a && !b) return "od razu • bez końca";
  if (a && !b) return `od ${a}`;
  if (!a && b) return `do ${b}`;
  return `${a} → ${b}`;
}

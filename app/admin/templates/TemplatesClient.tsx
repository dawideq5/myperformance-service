"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  FieldWrapper,
  Input,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  roleTemplateService,
  type AreaSummary,
  type RoleTemplate,
  type RoleTemplateAssignment,
} from "@/app/account/account-service";

interface TemplatesClientProps {
  userLabel: string;
  userEmail?: string;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TemplatesClient({
  userLabel,
  userEmail,
}: TemplatesClientProps) {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleTemplate | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, areasRes] = await Promise.all([
        roleTemplateService.list(),
        permissionAreaService.list(),
      ]);
      setTemplates(tplRes.templates);
      setAreas(areasRes.areas);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać szablonów",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const removeTemplate = useCallback(
    async (tpl: RoleTemplate) => {
      if (
        !window.confirm(
          `Usunąć szablon "${tpl.name}"?\n\nNie wpływa na obecnie przypisane uprawnienia użytkowników.`,
        )
      )
        return;
      try {
        await roleTemplateService.remove(tpl.id);
        setNotice(`Szablon "${tpl.name}" usunięty.`);
        await load();
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się usunąć szablonu",
        );
      }
    },
    [load],
  );

  return (
    <PageShell
      header={<AppHeader userLabel={userLabel} userSubLabel={userEmail} />}
    >
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Wróć do listy użytkowników
        </Link>
      </div>

      <section className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            Szablony ról
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Nazwane zestawy ról per-aplikacja — stosowane do użytkownika
            jednym kliknięciem. Każde zastosowanie wywołuje standardowy flow
            single-role-per-area + native sync.
          </p>
        </div>
        <Button
          onClick={() => setEditing("new")}
          leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          Nowy szablon
        </Button>
      </section>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      {loading ? (
        <Card padding="md">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Ładowanie szablonów…
          </div>
        </Card>
      ) : templates.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Brak szablonów. Stwórz pierwszy — np. „Sprzedawca standardowy&rdquo;
            (sprzedawca + chatwoot_agent + moodle_student + knowledge_user +
            kadromierz_user).
          </p>
          <Button
            size="sm"
            onClick={() => setEditing("new")}
            leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Stwórz pierwszy szablon
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((tpl) => {
            const assignedCount = tpl.areaRoles.filter(
              (a) => a.roleName !== null,
            ).length;
            return (
              <Card key={tpl.id} padding="md">
                <header className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm text-[var(--text-main)]">
                      {tpl.name}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {tpl.description || "—"}
                    </p>
                  </div>
                  <Badge tone="info">{assignedCount} ról</Badge>
                </header>
                <ul className="text-xs text-[var(--text-muted)] space-y-0.5 mb-3 font-mono max-h-32 overflow-y-auto">
                  {tpl.areaRoles
                    .filter((ar) => ar.roleName !== null)
                    .map((ar) => (
                      <li key={ar.areaId}>
                        <span className="text-[var(--text-main)]">
                          {ar.areaId}
                        </span>
                        {" → "}
                        {ar.roleName}
                      </li>
                    ))}
                </ul>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    edytowany {formatDate(tpl.updatedAt)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      }
                      onClick={() => setEditing(tpl)}
                    >
                      Edytuj
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      }
                      className="text-red-500 hover:text-red-600"
                      onClick={() => void removeTemplate(tpl)}
                    >
                      Usuń
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TemplateEditor
        state={editing}
        areas={areas}
        onClose={() => setEditing(null)}
        onSaved={(label) => {
          setEditing(null);
          setNotice(label);
          void load();
        }}
      />
    </PageShell>
  );
}

interface TemplateEditorProps {
  state: RoleTemplate | "new" | null;
  areas: AreaSummary[];
  onClose: () => void;
  onSaved: (label: string) => void;
}

function TemplateEditor({ state, areas, onClose, onSaved }: TemplateEditorProps) {
  const isNew = state === "new";
  const initial = typeof state === "object" && state ? state : null;
  const open = state !== null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [areaRoles, setAreaRoles] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (isNew) {
      setName("");
      setDescription("");
      const map: Record<string, string | null> = {};
      for (const a of areas) map[a.id] = null;
      setAreaRoles(map);
    } else if (initial) {
      setName(initial.name);
      setDescription(initial.description);
      const map: Record<string, string | null> = {};
      for (const a of areas) map[a.id] = null;
      for (const ar of initial.areaRoles) map[ar.areaId] = ar.roleName;
      setAreaRoles(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isNew, initial?.id]);

  const assignments = useMemo<RoleTemplateAssignment[]>(
    () =>
      Object.entries(areaRoles).map(([areaId, roleName]) => ({
        areaId,
        roleName,
      })),
    [areaRoles],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError("Podaj nazwę");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        if (isNew) {
          await roleTemplateService.create({
            name: name.trim(),
            description: description.trim(),
            areaRoles: assignments,
          });
          onSaved(`Szablon "${name.trim()}" utworzony.`);
        } else if (initial) {
          await roleTemplateService.update(initial.id, {
            name: name.trim(),
            description: description.trim(),
            areaRoles: assignments,
          });
          onSaved(`Szablon "${name.trim()}" zaktualizowany.`);
        }
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zapisać szablonu",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [name, description, assignments, isNew, initial, onSaved],
  );

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => {} : onClose}
      size="lg"
      title={isNew ? "Nowy szablon ról" : `Edycja: ${initial?.name ?? ""}`}
      description="Wybierz rolę w każdej aplikacji lub zostaw 'brak' — template przy zastosowaniu ustawi dokładnie ten stan u usera."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="template-form"
            loading={submitting}
            leftIcon={<Check className="w-4 h-4" aria-hidden="true" />}
          >
            {isNew ? "Utwórz" : "Zapisz"}
          </Button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldWrapper id="tpl-name" label="Nazwa" required>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Sprzedawca standardowy"
            />
          </FieldWrapper>
          <FieldWrapper id="tpl-desc" label="Opis">
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Krótki opis dla kogo ten szablon"
            />
          </FieldWrapper>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-[var(--text-main)] mb-2">
            Role per aplikacja
          </h4>
          <ul className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
            {areas.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    {a.label}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)] truncate">
                    {a.description}
                  </span>
                </div>
                <select
                  value={areaRoles[a.id] ?? ""}
                  onChange={(e) =>
                    setAreaRoles((prev) => ({
                      ...prev,
                      [a.id]: e.target.value === "" ? null : e.target.value,
                    }))
                  }
                  className="flex-shrink-0 max-w-[240px] px-2 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)]"
                >
                  <option value="">— brak —</option>
                  {a.seedRoles.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </Dialog>
  );
}

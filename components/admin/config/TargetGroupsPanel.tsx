"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  TARGET_GROUP_UNIT_OPTIONS,
  buildTargetGroupBody,
  buildThresholdBody,
  isNewThresholdId,
  nextThresholdFromValue,
  readApiError,
  type TargetGroupDTO,
  type TargetThresholdDTO,
} from "@/lib/services/config-service";

/**
 * CRUD nad mp_target_groups + mp_target_thresholds. Każda grupa to
 * kategoria produktów/usług dla planów punktów (uchwyty, gwarancje, etc.).
 * Per-grupa: dowolna liczba progów [from, to] → wartość. Używane w panelach
 * sprzedawca/serwisant do liczenia punktów lojalnościowych / prowizji.
 */
export function TargetGroupsPanel() {
  const toast = useToast();
  const [groups, setGroups] = useState<TargetGroupDTO[]>([]);
  const [thresholdsByGroup, setThresholdsByGroup] = useState<
    Record<string, TargetThresholdDTO[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TargetGroupDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [thresholdsFor, setThresholdsFor] = useState<TargetGroupDTO | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/target-groups");
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setGroups(json.data?.groups ?? []);
      setThresholdsByGroup(json.data?.thresholdsByGroup ?? {});
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Nie udało się pobrać grup",
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDelete = useCallback(
    async (g: TargetGroupDTO) => {
      if (!confirm(`Usunąć grupę "${g.label}" wraz ze wszystkimi progami?`))
        return;
      try {
        const res = await fetch(`/api/admin/target-groups/${g.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        toast.success("Grupa usunięta");
        void refresh();
      } catch (err) {
        toast.error(
          "Błąd",
          err instanceof Error ? err.message : "Nie udało się usunąć",
        );
      }
    },
    [refresh, toast],
  );

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          Kategorie produktów i usług dla planów punktów. Każda grupa ma własne
          progi (od X do Y → wartość).
        </p>
        <Button
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setCreating(true)}
        >
          Dodaj grupę
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-[var(--text-muted)] py-6">
            Brak grup targetowych. Dodaj pierwszą — domyślnie zaseedowane jest
            8 grup, jeśli ich nie widzisz, sprawdź połączenie z Directusem.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => (
            <TargetGroupCard
              key={g.id}
              group={g}
              thresholds={thresholdsByGroup[g.id] ?? []}
              onEdit={() => setEditing(g)}
              onDelete={() => void onDelete(g)}
              onManageThresholds={() => setThresholdsFor(g)}
            />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <TargetGroupDialog
          group={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            void refresh();
          }}
        />
      )}

      {thresholdsFor && (
        <ThresholdsDialog
          group={thresholdsFor}
          thresholds={thresholdsByGroup[thresholdsFor.id] ?? []}
          onClose={() => setThresholdsFor(null)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}

function TargetGroupCard({
  group: g,
  thresholds: ts,
  onEdit,
  onDelete,
  onManageThresholds,
}: {
  group: TargetGroupDTO;
  thresholds: TargetThresholdDTO[];
  onEdit: () => void;
  onDelete: () => void;
  onManageThresholds: () => void;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold truncate">{g.label}</span>
            {!g.enabled && <Badge tone="neutral">Wył.</Badge>}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono">
            {g.code} · jednostka: {g.unit}
            {g.externalCode ? ` · ERP: ${g.externalCode}` : ""}
          </div>
          {g.description && (
            <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
              {g.description}
            </p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-[var(--bg-surface)] transition"
            aria-label="Edytuj"
            title="Edytuj"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-rose-500/10 text-rose-400 transition"
            aria-label="Usuń"
            title="Usuń"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="border-t border-[var(--border-subtle)] pt-2 mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            Progi ({ts.length})
          </span>
          <button
            type="button"
            onClick={onManageThresholds}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Zarządzaj progami →
          </button>
        </div>
        {ts.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">Brak progów.</p>
        ) : (
          <div className="space-y-1">
            {ts.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs gap-2"
              >
                <span className="text-[var(--text-muted)] truncate">
                  {t.label ??
                    `${t.fromValue}–${t.toValue ?? "∞"} ${g.unit}`}
                </span>
                <span className="font-mono">{t.value}</span>
              </div>
            ))}
            {ts.length > 3 && (
              <p className="text-[10px] text-[var(--text-muted)]">
                +{ts.length - 3} więcej
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function TargetGroupDialog({
  group,
  onClose,
  onSaved,
}: {
  group: TargetGroupDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(group?.code ?? "");
  const [label, setLabel] = useState(group?.label ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [unit, setUnit] = useState(group?.unit ?? "szt");
  const [externalCode, setExternalCode] = useState(group?.externalCode ?? "");
  const [sort, setSort] = useState(String(group?.sort ?? 0));
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = buildTargetGroupBody({
        code,
        label,
        description,
        unit,
        externalCode,
        sort,
        enabled,
      });
      const url = group
        ? `/api/admin/target-groups/${group.id}`
        : `/api/admin/target-groups`;
      const res = await fetch(url, {
        method: group ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      toast.success(group ? "Grupa zaktualizowana" : "Grupa utworzona");
      onSaved();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Zapis nieudany",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? `Edycja: ${group.label}` : "Nowa grupa targetowa"}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Kod"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="np. UCH_SAM"
            required
            disabled={!!group}
            hint="A-Z 0-9 _ (2-32 znaki). Niezmienny po utworzeniu."
          />
          <Input
            label="Nazwa"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="np. Uchwyty samochodowe"
            required
          />
        </div>
        <Textarea
          label="Opis"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
              Jednostka
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm focus:outline-none focus:border-[var(--accent)]"
            >
              {TARGET_GROUP_UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Sortowanie"
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            min={0}
            max={999}
          />
        </div>
        <Input
          label="Kod ERP (opcjonalnie)"
          value={externalCode}
          onChange={(e) => setExternalCode(e.target.value)}
          placeholder="Mapping do zewnętrznego systemu"
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Grupa aktywna (widoczna w panelach)</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" loading={saving}>
            {group ? "Zapisz" : "Utwórz"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ThresholdsDialog({
  group,
  thresholds,
  onClose,
  onChanged,
}: {
  group: TargetGroupDTO;
  thresholds: TargetThresholdDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<TargetThresholdDTO[]>(thresholds);
  const [saving, setSaving] = useState(false);

  useEffect(() => setItems(thresholds), [thresholds]);

  const addRow = () => {
    setItems([
      ...items,
      {
        id: `new-${Date.now()}`,
        groupId: group.id,
        label: "",
        fromValue: nextThresholdFromValue(items),
        toValue: null,
        value: 0,
        color: null,
        sort: items.length,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<TargetThresholdDTO>) => {
    setItems(items.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeRow = async (t: TargetThresholdDTO, idx: number) => {
    if (isNewThresholdId(t.id)) {
      setItems(items.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("Usunąć ten próg?")) return;
    try {
      const res = await fetch(
        `/api/admin/target-groups/${group.id}/thresholds/${t.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      setItems(items.filter((_, i) => i !== idx));
      onChanged();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Usuwanie nieudane",
      );
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save kolejno — POST dla nowych, PATCH dla istniejących.
      for (const t of items) {
        const isNew = isNewThresholdId(t.id);
        const body = buildThresholdBody(t);
        const url = isNew
          ? `/api/admin/target-groups/${group.id}/thresholds`
          : `/api/admin/target-groups/${group.id}/thresholds/${t.id}`;
        const res = await fetch(url, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
      }
      toast.success("Progi zapisane");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(
        "Błąd",
        err instanceof Error ? err.message : "Zapis nieudany",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Progi grupy: ${group.label}`}
      size="lg"
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Każdy próg to range [od, do] z przypisaną wartością (np. cena za szt,
          punkty lojalnościowe, prowizja). Pole „do&rdquo; puste = bez górnego
          limitu.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)] px-1">
            <div className="col-span-3">Nazwa progu</div>
            <div className="col-span-2">Od</div>
            <div className="col-span-2">Do</div>
            <div className="col-span-2">Wartość</div>
            <div className="col-span-2">Kolor</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((t, idx) => (
            <div
              key={t.id}
              className="grid grid-cols-12 gap-2 items-center"
            >
              <input
                value={t.label ?? ""}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
                placeholder="Niski / Średni / Wysoki"
                className="col-span-3 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.fromValue}
                onChange={(e) =>
                  updateRow(idx, {
                    fromValue: Number(e.target.value) || 0,
                  })
                }
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.toValue ?? ""}
                onChange={(e) =>
                  updateRow(idx, {
                    toValue:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="∞"
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="number"
                value={t.value}
                onChange={(e) =>
                  updateRow(idx, { value: Number(e.target.value) || 0 })
                }
                className="col-span-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm"
              />
              <input
                type="color"
                value={t.color ?? "#3b82f6"}
                onChange={(e) => updateRow(idx, { color: e.target.value })}
                className="col-span-2 w-full h-9 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => void removeRow(t, idx)}
                className="col-span-1 p-1.5 rounded hover:bg-rose-500/10 text-rose-400 transition flex items-center justify-center"
                aria-label="Usuń próg"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-center text-sm text-[var(--text-muted)] py-4">
              Brak progów. Dodaj pierwszy.
            </p>
          )}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border-subtle)]">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={addRow}
          >
            Dodaj próg
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
            <Button onClick={saveAll} loading={saving}>
              Zapisz wszystko
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

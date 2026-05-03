"use client";

import { useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Plus,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { PageShell } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type {
  CombinableMode,
  RepairType,
  RepairTypeInput,
  TimeUnit,
} from "@/lib/repair-types";

type DraftType = Omit<RepairType, "id"> & { id?: string };

const COMBINABLE_OPTIONS: { value: CombinableMode; label: string }[] = [
  { value: "yes", label: "Tak — łącz z każdym" },
  { value: "no", label: "Nie — wyłączna naprawa" },
  { value: "only_with", label: "Tylko z wybranymi" },
  { value: "except", label: "Z każdym z wyjątkiem" },
];

const TIME_UNITS: { value: TimeUnit; label: string }[] = [
  { value: "minutes", label: "minuty" },
  { value: "hours", label: "godziny" },
  { value: "days", label: "dni" },
];

const ICON_SUGGESTIONS = [
  "Wrench",
  "Smartphone",
  "Battery",
  "Cable",
  "Camera",
  "Code",
  "Database",
  "HelpCircle",
  "KeyRound",
  "Mic",
  "PackageOpen",
  "Shield",
  "ClipboardList",
  "Speaker",
  "TabletSmartphone",
  "Volume2",
  "Sparkles",
  "Cpu",
  "Lock",
  "Hammer",
  "Zap",
];

function resolveIcon(name: string): typeof Wrench {
  const lib = (LucideIcons as unknown as Record<string, unknown>)[name];
  if (typeof lib === "function" || (typeof lib === "object" && lib !== null)) {
    return lib as typeof Wrench;
  }
  return Wrench;
}

export function RepairTypesAdminClient({
  initialTypes,
  userLabel,
  userEmail,
}: {
  initialTypes: RepairType[];
  userLabel?: string;
  userEmail?: string;
}) {
  const [types, setTypes] = useState<RepairType[]>(initialTypes);
  const [editing, setEditing] = useState<DraftType | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null,
  );

  const codes = useMemo(() => types.map((t) => t.code), [types]);

  function pushToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  }

  function startNew() {
    setEditing({
      code: "",
      label: "",
      category: "Inne",
      icon: "Wrench",
      color: "#3b82f6",
      description: "",
      defaultWarrantyMonths: null,
      timeMin: null,
      timeMax: null,
      timeUnit: "minutes",
      combinableMode: "yes",
      combinableWith: [],
      sumsMode: "yes",
      sumsWith: [],
      isActive: true,
      sortOrder: types.length * 10 + 10,
    });
  }

  // Generuje kod A-Z/0-9/_ z nazwy ("Wymiana ekranu" → "WYMIANA_EKRANU").
  function slugifyCode(name: string): string {
    return name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function startEdit(t: RepairType) {
    setEditing({ ...t });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveDraft() {
    if (!editing) return;
    // Tylko `name` jest wymagana; code/label/category generowane automatycznie.
    const nameSource = editing.label.trim();
    if (!nameSource) {
      pushToast("err", "Nazwa naprawy wymagana");
      return;
    }
    const finalCode = editing.code.trim() || slugifyCode(nameSource);
    if (!finalCode) {
      pushToast("err", "Nie udało się wygenerować kodu z nazwy");
      return;
    }
    setBusy(true);
    try {
      const payload: Partial<RepairTypeInput> = {
        code: finalCode,
        label: nameSource,
        icon: editing.icon,
        color: editing.color,
        description: editing.description ?? null,
        defaultWarrantyMonths: editing.defaultWarrantyMonths,
        timeMin: editing.timeMin,
        timeMax: editing.timeMax,
        timeUnit: editing.timeUnit,
        combinableMode: editing.combinableMode,
        combinableWith: editing.combinableWith,
        sumsMode: editing.sumsMode,
        sumsWith: editing.sumsWith,
        isActive: editing.isActive,
        sortOrder: editing.sortOrder,
      };
      if (editing.id) {
        const r = await fetch(`/api/admin/repair-types/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setTypes((prev) =>
          prev.map((t) => (t.id === editing.id ? (j.type as RepairType) : t)),
        );
        pushToast("ok", "Zapisano zmiany");
      } else {
        const r = await fetch("/api/admin/repair-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setTypes((prev) => [...prev, j.type as RepairType]);
        pushToast("ok", "Utworzono nowy typ");
      }
      setEditing(null);
    } catch (e) {
      pushToast("err", e instanceof Error ? e.message : "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  }

  async function deleteType(t: RepairType) {
    if (
      !window.confirm(
        `Usunąć typ naprawy "${t.label}"? Ta operacja jest nieodwracalna.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/repair-types/${t.id}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setTypes((prev) => prev.filter((x) => x.id !== t.id));
      pushToast("ok", "Usunięto");
    } catch (e) {
      pushToast("err", e instanceof Error ? e.message : "Błąd usuwania");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      maxWidth="xl"
      header={
        <AppHeader
          title="Typy napraw"
          backHref="/dashboard"
          parentHref="/admin/config"
          parentLabel="Konfiguracja"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}
            >
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h1
                className="text-xl sm:text-2xl font-bold"
                style={{ color: "var(--text-main)" }}
              >
                Katalog typów napraw
              </h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Rodzaje napraw — gwarancja, czas wykonania, reguły łączenia.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startNew}
            disabled={busy || !!editing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              borderColor: "rgba(99,102,241,0.5)",
              color: "#fff",
            }}
          >
            <Plus className="w-4 h-4" />
            Dodaj typ naprawy
          </button>
        </header>

        {toast && (
          <div
            className="rounded-xl border-2 px-4 py-2 text-sm flex items-center gap-2"
            style={{
              background:
                toast.kind === "ok"
                  ? "rgba(34,197,94,0.1)"
                  : "rgba(239,68,68,0.1)",
              borderColor:
                toast.kind === "ok"
                  ? "rgba(34,197,94,0.4)"
                  : "rgba(239,68,68,0.4)",
              color: toast.kind === "ok" ? "#22C55E" : "#EF4444",
            }}
          >
            {toast.kind === "ok" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toast.msg}
          </div>
        )}

        {editing && (
          <RepairTypeEditor
            draft={editing}
            allCodes={codes}
            busy={busy}
            onChange={setEditing}
            onSave={saveDraft}
            onCancel={cancelEdit}
          />
        )}

        <div className="space-y-2">
          {types.length === 0 && !editing && (
            <div
              className="p-6 text-center rounded-xl border"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Brak typów napraw. Kliknij „Dodaj typ naprawy&rdquo;.
            </div>
          )}
          {types
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((t) => (
              <RepairTypeRow
                key={t.id}
                type={t}
                disabled={busy || !!editing}
                onEdit={() => startEdit(t)}
                onDelete={() => deleteType(t)}
              />
            ))}
        </div>
      </div>
    </PageShell>
  );
}

function RepairTypeRow({
  type,
  disabled,
  onEdit,
  onDelete,
}: {
  type: RepairType;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = resolveIcon(type.icon);
  const combinableLabel = (() => {
    switch (type.combinableMode) {
      case "yes":
        return "Łącz z każdym";
      case "no":
        return "Wyłączna";
      case "only_with":
        return `Tylko z: ${type.combinableWith.join(", ") || "—"}`;
      case "except":
        return `Z wyjątkiem: ${type.combinableWith.join(", ") || "—"}`;
    }
  })();
  const sumsLabel = (() => {
    switch (type.sumsMode) {
      case "yes":
        return "Sumuj cenę";
      case "no":
        return "Kontakt z serwisantem";
      case "only_with":
        return `Sumuj z: ${type.sumsWith.join(", ") || "—"}`;
      case "except":
        return `Sumuj z wyjątkiem: ${type.sumsWith.join(", ") || "—"}`;
    }
  })();
  return (
    <div
      className="rounded-xl border p-4 flex items-start gap-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        opacity: type.isActive ? 1 : 0.55,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: type.color + "22", color: type.color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-bold"
            style={{ color: "var(--text-main)" }}
          >
            {type.label}
          </span>
          {!type.isActive && (
            <span
              className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "#EF4444",
              }}
            >
              Nieaktywny
            </span>
          )}
        </div>
        <div
          className="mt-1 text-xs flex flex-wrap gap-x-3 gap-y-1"
          style={{ color: "var(--text-muted)" }}
        >
          <span>Gwarancja: {type.defaultWarrantyMonths != null ? `${type.defaultWarrantyMonths} mc` : "brak"}</span>
          <span>
            Czas: {type.timeMin != null && type.timeMax != null
              ? `${type.timeMin}-${type.timeMax} ${type.timeUnit}`
              : "—"}
          </span>
          <span>Łączenie: {combinableLabel}</span>
          <span>Suma: {sumsLabel}</span>
        </div>
        {type.description && (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {type.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="p-2 rounded-lg border transition-all hover:scale-105 disabled:opacity-40"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          title="Edytuj"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="p-2 rounded-lg border transition-all hover:scale-105 disabled:opacity-40"
          style={{
            background: "rgba(239,68,68,0.1)",
            borderColor: "rgba(239,68,68,0.3)",
            color: "#EF4444",
          }}
          title="Usuń"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function RepairTypeEditor({
  draft,
  allCodes,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DraftType;
  allCodes: string[];
  busy: boolean;
  onChange: (next: DraftType) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const otherCodes = allCodes.filter((c) => c !== draft.code);
  const Icon = resolveIcon(draft.icon);

  return (
    <div
      className="rounded-2xl border-2 p-5 space-y-4"
      style={{
        background: "var(--bg-card)",
        borderColor: draft.color,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: draft.color + "22", color: draft.color }}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h2
              className="font-bold text-lg"
              style={{ color: "var(--text-main)" }}
            >
              {draft.id ? "Edytuj typ naprawy" : "Nowy typ naprawy"}
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {draft.label || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="p-2 rounded-lg border text-sm flex items-center gap-1"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <X className="w-4 h-4" />
            Anuluj
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="p-2 px-4 rounded-lg border-2 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
            style={{
              background: draft.color,
              borderColor: draft.color,
              color: "#fff",
            }}
          >
            <Save className="w-4 h-4" />
            Zapisz
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Tylko "Nazwa naprawy" — kod generowany automatycznie z nazwy
            (slug uppercase), label = name, category = "Inne" jako domyślne. */}
        <div className="col-span-2">
          <Field label="Nazwa naprawy">
            <input
              type="text"
              value={draft.label}
              onChange={(e) => onChange({ ...draft, label: e.target.value })}
              placeholder="Wymiana wyświetlacza"
              className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </Field>
        </div>

        <Field label="Ikona (lucide)">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={draft.icon}
              onChange={(e) => onChange({ ...draft, icon: e.target.value })}
              placeholder="Wrench"
              list="icon-suggestions"
              className="flex-1 px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
            <datalist id="icon-suggestions">
              {ICON_SUGGESTIONS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <a
              href="https://lucide.dev/icons/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] underline"
              style={{ color: "var(--text-muted)" }}
            >
              lucide.dev
            </a>
          </div>
        </Field>
        <Field label="Kolor">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => onChange({ ...draft, color: e.target.value })}
            className="w-full h-10 rounded-lg border cursor-pointer"
            style={{ borderColor: "var(--border-subtle)" }}
          />
        </Field>

        <div className="col-span-2">
          <Field label="Opis (opcjonalny)">
            <textarea
              value={draft.description ?? ""}
              onChange={(e) =>
                onChange({ ...draft, description: e.target.value })
              }
              rows={2}
              placeholder="Kiedy używać tego typu naprawy"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </Field>
        </div>

        <Field label="Gwarancja (mc)">
          <input
            type="number"
            min={0}
            value={draft.defaultWarrantyMonths ?? ""}
            onChange={(e) =>
              onChange({
                ...draft,
                defaultWarrantyMonths: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            placeholder="brak"
            className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          />
        </Field>
        <Field label="Sortowanie">
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(e) =>
              onChange({ ...draft, sortOrder: Number(e.target.value) })
            }
            className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          />
        </Field>

        <div className="col-span-2 grid grid-cols-3 gap-3">
          <Field label="Czas — od">
            <input
              type="number"
              min={0}
              value={draft.timeMin ?? ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  timeMin: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </Field>
          <Field label="Czas — do">
            <input
              type="number"
              min={0}
              value={draft.timeMax ?? ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  timeMax: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </Field>
          <Field label="Jednostka">
            <select
              value={draft.timeUnit}
              onChange={(e) =>
                onChange({ ...draft, timeUnit: e.target.value as TimeUnit })
              }
              className="w-full px-3 py-2 rounded-lg border outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              {TIME_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Combinable rules */}
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <CombinableEditor
            label="Łączenie z innymi naprawami"
            mode={draft.combinableMode}
            list={draft.combinableWith}
            allCodes={otherCodes}
            onChangeMode={(m) =>
              onChange({ ...draft, combinableMode: m, combinableWith: [] })
            }
            onChangeList={(l) =>
              onChange({ ...draft, combinableWith: l })
            }
          />
          <CombinableEditor
            label="Sumowanie cen w kombinacji"
            mode={draft.sumsMode}
            list={draft.sumsWith}
            allCodes={otherCodes}
            onChangeMode={(m) =>
              onChange({ ...draft, sumsMode: m, sumsWith: [] })
            }
            onChangeList={(l) => onChange({ ...draft, sumsWith: l })}
          />
        </div>

        <div className="col-span-2 flex items-center gap-2 pt-2">
          <input
            id="is-active"
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) =>
              onChange({ ...draft, isActive: e.target.checked })
            }
            className="w-4 h-4 rounded"
          />
          <label
            htmlFor="is-active"
            className="text-sm cursor-pointer"
            style={{ color: "var(--text-main)" }}
          >
            Typ naprawy aktywny (widoczny w panelu sprzedawcy)
          </label>
        </div>
      </div>
    </div>
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
      <span
        className="text-[11px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CombinableEditor({
  label,
  mode,
  list,
  allCodes,
  onChangeMode,
  onChangeList,
}: {
  label: string;
  mode: CombinableMode;
  list: string[];
  allCodes: string[];
  onChangeMode: (m: CombinableMode) => void;
  onChangeList: (l: string[]) => void;
}) {
  const showList = mode === "only_with" || mode === "except";
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <span
        className="block text-[11px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <select
        value={mode}
        onChange={(e) => onChangeMode(e.target.value as CombinableMode)}
        className="w-full px-2 py-1.5 rounded-md border text-xs outline-none focus:border-[var(--accent)]"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        {COMBINABLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {showList && (
        <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
          {allCodes.map((code) => {
            const checked = list.includes(code);
            return (
              <label
                key={code}
                className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:opacity-80"
                style={{ color: "var(--text-main)" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onChangeList([...list, code]);
                    } else {
                      onChangeList(list.filter((c) => c !== code));
                    }
                  }}
                  className="w-3 h-3"
                />
                <span className="font-mono truncate">{code}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

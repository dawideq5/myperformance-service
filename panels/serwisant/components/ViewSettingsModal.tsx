"use client";

/**
 * Wave 20 / Faza 1G — Modal "Ustawienia widoku" dla Service detail view.
 *
 * Pozwala userowi:
 *   - reorder zakładek (drag-drop, native HTML5 — lekkie, bez deps)
 *   - hide/show zakładek (toggle-y)
 *   - density (compact / comfortable)
 *   - font-size (small / normal / large)
 *   - default landing tab (select z visible tabs)
 *
 * Persystencja: backend `/api/relay/account/preferences/serwisant-detail`
 * (PATCH, debounced 500ms). Optimistic UI — zmiana lokalna jest natychmiast
 * odzwierciedlona, network call w tle.
 *
 * A11y:
 *   - role="dialog", aria-modal=true, aria-labelledby
 *   - focus trap (Esc zamyka)
 *   - drag handle ma aria-label, każdy element listy aria-grabbed
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { GripVertical, RotateCcw, Settings2, X } from "lucide-react";

export type DensityValue = "compact" | "comfortable";
export type FontSizeValue = "small" | "normal" | "large";

export interface TabSpec {
  id: string;
  label: string;
}

export interface ViewSettingsValue {
  tabOrder: string[];
  /** Map: tabId → false gdy hidden. Brak klucza = visible. */
  tabVisibility: Record<string, boolean>;
  density: DensityValue;
  fontSize: FontSizeValue;
  defaultLandingTab: string;
}

interface ViewSettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Wszystkie zakładki w default order. */
  allTabs: TabSpec[];
  value: ViewSettingsValue;
  onChange: (next: ViewSettingsValue) => void;
  /** Reset do default — ustawia tabOrder=null fingerprint, visibility={} itd. */
  onReset: () => void;
}

export function ViewSettingsModal({
  open,
  onClose,
  allTabs,
  value,
  onChange,
  onReset,
}: ViewSettingsModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Resolve final ordered tabs (apply tabOrder, append missing, then full list).
  const orderedTabs = useMemo<TabSpec[]>(() => {
    const byId = new Map(allTabs.map((t) => [t.id, t]));
    const ordered: TabSpec[] = [];
    const seen = new Set<string>();
    for (const id of value.tabOrder) {
      const t = byId.get(id);
      if (t) {
        ordered.push(t);
        seen.add(id);
      }
    }
    for (const t of allTabs) {
      if (!seen.has(t.id)) ordered.push(t);
    }
    return ordered;
  }, [allTabs, value.tabOrder]);

  // Esc key + initial focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Initial focus on close button (focus trap is light — natural tab order).
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const isHidden = useCallback(
    (id: string) => value.tabVisibility[id] === false,
    [value.tabVisibility],
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      const nextVis = { ...value.tabVisibility };
      // Wyznaczamy nową wartość: jeśli teraz hidden (false) → unhide (true);
      // jeśli visible (brak klucza lub true) → hide (false).
      const currentlyHidden = nextVis[id] === false;
      if (currentlyHidden) {
        nextVis[id] = true; // explicit visible
      } else {
        nextVis[id] = false; // explicit hidden
      }
      let nextLanding = value.defaultLandingTab;
      // Jeśli hide-ujemy aktualną default landing tab → wybierz pierwszą visible.
      if (!currentlyHidden && id === nextLanding) {
        const firstVisible = orderedTabs.find(
          (t) => t.id !== id && nextVis[t.id] !== false,
        );
        nextLanding = firstVisible?.id ?? orderedTabs[0]?.id ?? id;
      }
      onChange({
        ...value,
        tabVisibility: nextVis,
        defaultLandingTab: nextLanding,
      });
    },
    [orderedTabs, value, onChange],
  );

  const moveTab = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const ids = orderedTabs.map((t) => t.id);
      const sIdx = ids.indexOf(sourceId);
      const tIdx = ids.indexOf(targetId);
      if (sIdx === -1 || tIdx === -1) return;
      ids.splice(sIdx, 1);
      ids.splice(tIdx, 0, sourceId);
      onChange({ ...value, tabOrder: ids });
    },
    [orderedTabs, value, onChange],
  );

  const onDragStart = useCallback(
    (e: React.DragEvent<HTMLLIElement>, id: string) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", id);
      } catch {
        /* some browsers reject empty payload — fallback do dragId state */
      }
    },
    [],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = dragId ?? e.dataTransfer.getData("text/plain");
      if (sourceId) moveTab(sourceId, targetId);
      setDragId(null);
    },
    [dragId, moveTab],
  );

  const visibleTabs = useMemo(
    () => orderedTabs.filter((t) => !isHidden(t.id)),
    [orderedTabs, isHidden],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h2 id={titleId} className="text-base font-semibold">
              Ustawienia widoku
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Tab order + visibility */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}>
              Kolejność i widoczność zakładek
            </h3>
            <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
              Przeciągnij za uchwyt aby zmienić kolejność. Kliknij przełącznik
              żeby ukryć zakładkę.
            </p>
            <ul className="space-y-1" role="list">
              {orderedTabs.map((t) => {
                const hidden = isHidden(t.id);
                const dragging = dragId === t.id;
                return (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, t.id)}
                    onDragEnd={() => setDragId(null)}
                    aria-grabbed={dragging}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border"
                    style={{
                      borderColor: "var(--border-subtle)",
                      background: dragging
                        ? "var(--bg-surface)"
                        : "transparent",
                      opacity: hidden ? 0.55 : 1,
                      cursor: "grab",
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span aria-label="Uchwyt do przeciągania">
                        <GripVertical
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </span>
                      <span className="text-sm truncate">{t.label}</span>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer flex-shrink-0">
                      <span style={{ color: "var(--text-muted)" }}>
                        {hidden ? "ukryta" : "widoczna"}
                      </span>
                      <input
                        type="checkbox"
                        checked={!hidden}
                        onChange={() => toggleVisibility(t.id)}
                        aria-label={`${t.label}: ${hidden ? "Pokaż" : "Ukryj"} zakładkę`}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Density */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}>
              Gęstość
            </h3>
            <RadioGroup
              name="density"
              value={value.density}
              options={[
                { id: "compact", label: "Kompaktowa" },
                { id: "comfortable", label: "Komfortowa" },
              ]}
              onChange={(v) =>
                onChange({ ...value, density: v as DensityValue })
              }
            />
          </section>

          {/* Font size */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}>
              Rozmiar czcionki
            </h3>
            <RadioGroup
              name="fontSize"
              value={value.fontSize}
              options={[
                { id: "small", label: "Mała" },
                { id: "normal", label: "Normalna" },
                { id: "large", label: "Duża" },
              ]}
              onChange={(v) =>
                onChange({ ...value, fontSize: v as FontSizeValue })
              }
            />
          </section>

          {/* Default landing tab */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}>
              Domyślna zakładka
            </h3>
            <select
              value={value.defaultLandingTab}
              onChange={(e) =>
                onChange({ ...value, defaultLandingTab: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              {visibleTabs.length === 0 && (
                <option value="">— brak widocznych zakładek —</option>
              )}
              {visibleTabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Przywróć domyślne
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
}

interface RadioOpt {
  id: string;
  label: string;
}

function RadioGroup({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: RadioOpt[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup">
      {options.map((o) => {
        const checked = o.id === value;
        return (
          <label
            key={o.id}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
            style={{
              background: checked ? "var(--accent)" : "transparent",
              color: checked ? "#fff" : "var(--text-main)",
              borderColor: checked
                ? "var(--accent)"
                : "var(--border-subtle)",
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={checked}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

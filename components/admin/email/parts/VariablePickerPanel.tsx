"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import { Button, Card, Input } from "@/components/ui";
import {
  groupVariables,
  inferVariableType,
  variableManualPlaceholder,
} from "@/lib/services/email-service";

import type { CatalogVariable, PickerState } from "../types";

/** Panel wyboru zmiennej — renderowany w prawej kolumnie zamiast preview. */
export function VariablePickerPanel({
  state,
  onPick,
  onPickLiteral,
  onHighlight,
  onClose,
}: {
  state: PickerState;
  onPick: (v: CatalogVariable) => void;
  /** Wstawia plain text zamiast {{path}} — np. user wpisuje URL ręcznie. */
  onPickLiteral: (literal: string) => void;
  onHighlight: (idx: number) => void;
  onClose: () => void;
}) {
  const [manualMode, setManualMode] = useState<CatalogVariable | null>(null);
  const [manualValue, setManualValue] = useState("");

  if (manualMode) {
    const t = inferVariableType(manualMode);
    return (
      <Card padding="md" className="border-[var(--accent)]/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--accent)]" />
            Wpisz wartość ręcznie
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setManualMode(null)}
            leftIcon={<X className="w-3.5 h-3.5" />}
          >
            Wróć
          </Button>
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-3">
          <strong className="text-[var(--text-main)]">{manualMode.label}</strong>{" "}
          · zamiast wstawiać <code className="text-[10px]">{`{{${manualMode.key}}}`}</code>{" "}
          (które system wypełni runtime), wstaw stałą wartość.
        </div>
        <Input
          label={t === "url" ? "URL" : t === "email" ? "Adres email" : "Wartość"}
          type={t === "email" ? "email" : "text"}
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          placeholder={variableManualPlaceholder(manualMode)}
          autoFocus
        />
        <div className="mt-3 text-[11px] text-amber-300/80">
          Uwaga: po wstawieniu jako stała wartość, ten fragment nie będzie się
          aktualizował dynamicznie. Używaj tylko dla URL-i które są stałe (np.
          link do polityki prywatności) lub gdy chcesz nadpisać systemową
          wartość.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setManualMode(null)}>
            Anuluj
          </Button>
          <Button
            onClick={() => {
              if (manualValue.trim()) {
                onPickLiteral(manualValue.trim());
                setManualMode(null);
                setManualValue("");
              }
            }}
            disabled={!manualValue.trim()}
          >
            Wstaw
          </Button>
        </div>
      </Card>
    );
  }

  const grouped = groupVariables(state.filtered);

  return (
    <Card padding="md" className="border-[var(--accent)]/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--accent)]" />
          Wstaw zmienną
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          leftIcon={<X className="w-3.5 h-3.5" />}
        >
          Zamknij
        </Button>
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mb-3">
        Wpisuj dalej w polu treści aby filtrować ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">
          ↑↓
        </kbd>{" "}
        nawigacja ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">
          Enter
        </kbd>{" "}
        wstawia ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px]">
          Esc
        </kbd>{" "}
        anuluje
      </div>
      {state.query && (
        <div className="text-[11px] text-[var(--text-muted)] mb-2">
          Filtr: <code className="text-[var(--accent)]">{state.query}</code>
          {state.filtered.length === 0 && " · brak dopasowań"}
        </div>
      )}
      <div className="max-h-[640px] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {state.filtered.length === 0 ? (
          <div className="p-4 text-xs text-[var(--text-muted)]">
            Brak zmiennych pasujących do filtra. Skasuj wpisany tekst po
            ukośniku albo naciśnij Esc, aby zamknąć picker.
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] uppercase text-[var(--text-muted)] bg-[var(--bg-main)] border-b border-[var(--border-subtle)] sticky top-0">
                {group}
              </div>
              {items.map((v) => {
                const idx = state.filtered.indexOf(v);
                const highlighted = idx === state.highlightedIdx;
                const t = inferVariableType(v);
                return (
                  <div
                    key={v.key}
                    onMouseEnter={() => onHighlight(idx)}
                    className={`flex items-center gap-2 border-b border-[var(--border-subtle)]/50 ${
                      highlighted
                        ? "bg-[var(--accent)]/10"
                        : "hover:bg-[var(--bg-main)]"
                    }`}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(v);
                      }}
                      className="flex-1 min-w-0 text-left px-3 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--text-main)] truncate">
                          {v.label}
                        </div>
                        <code className="text-[10px] text-[var(--text-muted)] block truncate">
                          {`{{${v.key}}}`}
                        </code>
                        {v.description && (
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                            {v.description}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] flex-shrink-0 max-w-[120px] truncate">
                        <span className="opacity-60">np. </span>
                        {v.example}
                      </div>
                    </button>
                    {(t === "url" || t === "email" || t === "text") && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setManualMode(v);
                          setManualValue("");
                        }}
                        title="Wpisz wartość ręcznie zamiast użyć systemowej"
                        className="flex-shrink-0 px-2 py-1 mr-2 text-[10px] rounded border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--text-muted)]"
                      >
                        wpisz ręcznie
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

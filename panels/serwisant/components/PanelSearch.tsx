"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

/**
 * Lokalna wyszukiwarka panel-side. MOCK — na razie tylko UI z input. Później
 * można podłączyć fetch do `/api/relay/services?q=...` itp.
 *
 * Zachowanie:
 *  - Klik triggeru → otwiera dialog (portal do body)
 *  - Esc / klik poza → zamyka
 *  - Skrót Cmd/Ctrl+K → toggle (capture na window)
 */
export function PanelSearch() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Auto-focus po otwarciu — drobny timeout żeby przebrnąć przez animację.
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:opacity-90"
        style={{
          color: "var(--text-muted, #6b6b7b)",
          borderColor: "var(--border-subtle, #1e1e2e)",
          background: "var(--bg-surface, #14141d)",
        }}
        aria-label="Szukaj w panelu"
        title="Szukaj (Ctrl/Cmd+K)"
      >
        <Search className="w-3.5 h-3.5" />
        <span>Szukaj…</span>
        <kbd
          className="font-mono text-[10px] px-1 py-0.5 rounded border"
          style={{
            background: "var(--bg-card, #12121a)",
            borderColor: "var(--border-subtle, #1e1e2e)",
          }}
        >
          ⌘K
        </kbd>
      </button>
      {/* Mobilna wersja triggera — tylko ikonka. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-xl transition-colors hover:opacity-90"
        style={{ color: "var(--text-muted, #6b6b7b)" }}
        aria-label="Szukaj w panelu"
      >
        <Search className="w-5 h-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483645] flex items-start justify-center pt-20 px-4"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Wyszukiwanie"
          >
            <div
              ref={dialogRef}
              className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"
              style={{
                background: "var(--bg-card, #12121a)",
                borderColor: "var(--border-subtle, #1e1e2e)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor: "var(--border-subtle, #1e1e2e)" }}
              >
                <Search
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: "var(--text-muted, #6b6b7b)" }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj zleceń, klientów, IMEI…"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: "var(--text-main, #f1f1f4)" }}
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 rounded hover:opacity-70"
                  aria-label="Zamknij wyszukiwanie"
                >
                  <X
                    className="w-4 h-4"
                    style={{ color: "var(--text-muted, #6b6b7b)" }}
                  />
                </button>
              </div>
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted, #6b6b7b)" }}
              >
                {query.trim().length === 0
                  ? "Wpisz frazę aby wyszukać w panelu."
                  : "Brak wyników. (Wyszukiwanie panel-side jest w przygotowaniu.)"}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

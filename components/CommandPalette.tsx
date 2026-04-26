"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Globe,
  LayoutGrid,
  Loader2,
  Monitor,
  Search,
  User,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api-client";

interface SearchHit {
  type: "user" | "ip" | "device" | "tile";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
}

const TYPE_ICON: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  user: User,
  ip: Globe,
  device: Monitor,
  tile: LayoutGrid,
};

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  user: "User",
  ip: "IP",
  device: "Urządzenie",
  tile: "Panel",
};

/**
 * Cmd+K / Ctrl+K command palette — fuzzy search po userach, IP, urządzeniach,
 * panelach. Hit klawiatury otwiera, ESC zamyka, ↑↓ nawigacja, Enter wybiera.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // Otwórz na Cmd+K / Ctrl+K
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
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      // Focus po renderze
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    if (q.length === 0) {
      setHits([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get<{ hits: SearchHit[] }>(
          `/api/admin/search?q=${encodeURIComponent(q)}`,
        );
        setHits(r.hits);
        setActive(0);
      } catch (err) {
        if (!(err instanceof ApiRequestError)) {
          console.warn("search error", err);
        }
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  const navigateTo = useCallback((href: string) => {
    window.location.href = href;
    setOpen(false);
  }, []);

  if (!mounted || !open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      navigateTo(hits[active].href);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Wyszukaj wszędzie"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-xl rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden animate-fade-in"
        onKeyDown={onListKey}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj: użytkownik, IP, urządzenie, panel…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--text-muted)]"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
          )}
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Wpisz email użytkownika, adres IP, fragment device id albo
              nazwę panelu (np. {"\u201E"}infrastruktura{"\u201D"},{" "}
              {"\u201E"}blocks{"\u201D"}).
            </div>
          ) : hits.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Brak wyników dla {"\u201E"}{q}{"\u201D"}.
            </div>
          ) : (
            <ul role="listbox">
              {hits.map((h, i) => {
                const Icon = TYPE_ICON[h.type];
                return (
                  <li key={`${h.type}-${h.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => navigateTo(h.href)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${
                        active === i
                          ? "bg-[var(--accent)]/10"
                          : "hover:bg-[var(--bg-surface)]"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-main)] flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate flex items-center gap-2">
                          {h.title}
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            {TYPE_LABEL[h.type]}
                          </span>
                        </div>
                        {h.subtitle && (
                          <div className="text-[11px] text-[var(--text-muted)] truncate">
                            {h.subtitle}
                          </div>
                        )}
                      </div>
                      {active === i && (
                        <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                          ↵
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> nawigacja
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> wybierz
          </span>
          <span className="ml-auto">
            <kbd className="font-mono">⌘K</kbd> aby zamknąć
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

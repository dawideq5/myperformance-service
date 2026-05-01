"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Globe,
  LayoutGrid,
  Loader2,
  Monitor,
  PlusCircle,
  Search,
  ShieldAlert,
  User,
  Wrench,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api-client";

interface SearchHit {
  type: "user" | "ip" | "device" | "tile" | "service" | "action";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
  requiresCert?: boolean;
}

const TYPE_ICON: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  user: User,
  ip: Globe,
  device: Monitor,
  tile: LayoutGrid,
  service: Wrench,
  action: PlusCircle,
};

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  user: "User",
  ip: "IP",
  device: "Urządzenie",
  tile: "Panel",
  service: "Serwis",
  action: "Akcja",
};

/** Kolejność grup w wynikach. */
const GROUP_ORDER: SearchHit["type"][] = ["action", "service", "user", "device", "ip", "tile"];
const GROUP_LABEL: Record<SearchHit["type"], string> = {
  action: "Akcje",
  service: "Serwisy",
  user: "Użytkownicy",
  device: "Urządzenia",
  ip: "Adresy IP",
  tile: "Panele",
};

// Zewnętrzny target: pełny URL (https://) lub /api/*/sso /api/*/launch
// (SSO bridge → app na innej domenie). Wewnętrzne /admin /account /dashboard
// nawigujemy w tej samej karcie.
function isExternalHref(href: string): boolean {
  if (/^https?:\/\//i.test(href)) return true;
  if (/^\/api\/[^/]+\/(sso|launch)(\?|$)/i.test(href)) return true;
  return false;
}

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
  const [certWarningHref, setCertWarningHref] = useState<string | null>(null);
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

  const navigateTo = useCallback((href: string, requiresCert?: boolean) => {
    if (requiresCert) {
      setCertWarningHref(href);
      return;
    }
    if (isExternalHref(href)) {
      // Zewnętrzny panel (Documenso/Moodle/Outline/Postal/Directus przez SSO
      // lub pełny URL) — otwieramy w nowej karcie. Dashboard zostaje otwarty.
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = href;
    }
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
      navigateTo(hits[active].href, hits[active].requiresCert);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2050] flex items-start justify-center p-4 sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Wyszukaj"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl mp-cmdk-glow animate-fade-in">
        <div
          className="relative rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
          onKeyDown={onListKey}
        >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj serwisów, użytkowników, numerów telefonów..."
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
        {/* Mobile-only hint że można dotknąć tła aby zamknąć — kbd nie ma
            sensu na touch device, ale ESC button na klawiaturze ekranowej
            może nie być dostępny. */}

        <div className="max-h-[60vh] overflow-y-auto">
          {q.length === 0 ? (
            <Suggestions onPick={navigateTo} />
          ) : hits.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              Brak wyników dla {"\u201E"}{q}{"\u201D"}.
            </div>
          ) : (
            <HitList hits={hits} active={active} setActive={setActive} navigateTo={navigateTo} />
          )}
          {/* Modal certyfikatu — pojawia się gdy user kliknie wynik serwisu */}
          {certWarningHref && (
            <div className="border-t border-[var(--border-subtle)] bg-amber-500/10 px-4 py-3 flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-200 font-medium">
                  Ten serwis wymaga zalogowania się na panel z certyfikatem klienckim.
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <a
                    href={certWarningHref}
                    onClick={() => { setOpen(false); setCertWarningHref(null); }}
                    className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2"
                  >
                    Otwórz panel serwisanta &rarr;
                  </a>
                  <button
                    type="button"
                    onClick={() => setCertWarningHref(null)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-base)]"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>
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
      </div>
    </div>,
    document.body,
  );
}

/**
 * Zgrupowana lista wyników — Akcje | Serwisy | Użytkownicy | Urządzenia | Panele.
 */
function HitList({
  hits,
  active,
  setActive,
  navigateTo,
}: {
  hits: SearchHit[];
  active: number;
  setActive: (i: number) => void;
  navigateTo: (href: string, requiresCert?: boolean) => void;
}) {
  // Podziel na grupy zachowując globalny indeks (do nawigacji klawiaturą).
  const groups: { type: SearchHit["type"]; items: { hit: SearchHit; globalIdx: number }[] }[] = [];
  for (const type of GROUP_ORDER) {
    const items = hits
      .map((hit, idx) => ({ hit, globalIdx: idx }))
      .filter(({ hit }) => hit.type === type);
    if (items.length > 0) groups.push({ type, items });
  }

  return (
    <ul role="listbox">
      {groups.map(({ type, items }) => (
        <li key={type}>
          <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
            {GROUP_LABEL[type]}
          </div>
          <ul>
            {items.map(({ hit: h, globalIdx: i }) => {
              const Icon = TYPE_ICON[h.type];
              const isAction = h.type === "action";
              const isService = h.type === "service";
              return (
                <li key={`${h.type}-${h.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => navigateTo(h.href, h.requiresCert)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${
                      active === i
                        ? "bg-[var(--accent)]/10"
                        : "hover:bg-[var(--bg-surface)]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isAction
                          ? "bg-emerald-500/15"
                          : isService
                          ? "bg-rose-500/10"
                          : "bg-[var(--bg-main)]"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          isAction
                            ? "text-emerald-400"
                            : isService
                            ? "text-rose-400"
                            : "text-[var(--text-muted)]"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate flex items-center gap-2">
                        <span className={isAction ? "text-emerald-300 font-medium" : ""}>
                          {h.title}
                        </span>
                        {isExternalHref(h.href) && !h.requiresCert && (
                          <ExternalLink
                            className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0"
                            aria-label="Otwiera w nowej karcie"
                          />
                        )}
                        {isService && h.meta && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-mono flex-shrink-0">
                            {h.meta.split(" · ")[0]}
                          </span>
                        )}
                        {!isService && (
                          <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            {TYPE_LABEL[h.type]}
                          </span>
                        )}
                      </div>
                      {h.subtitle && (
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {h.subtitle}
                        </div>
                      )}
                      {isService && h.meta && (
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {h.meta.split(" · ").slice(1).join(" · ")}
                        </div>
                      )}
                    </div>
                    {active === i && (
                      <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                        {h.requiresCert ? "!" : isExternalHref(h.href) ? "↗" : "↵"}
                      </kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * Sugestie po otwarciu palette — pobiera popularne panele dynamicznie z
 * /api/admin/search?q=* (filtrowane po dostępie). Bez hardcoded kategoryzacji.
 */
function Suggestions({ onPick }: { onPick: (href: string, requiresCert?: boolean) => void }) {
  const [items, setItems] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ hits: SearchHit[] }>(
          `/api/admin/search?q=panel&limit=12`,
        );
        if (!cancelled) setItems(r.hits);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
        Wczytywanie…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
        Zacznij wpisywać żeby wyszukać.
      </div>
    );
  }

  return (
    <ul role="listbox">
      <li className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
        Popularne — Twoje uprawnienia
      </li>
      {items.map((h) => {
        const Icon = TYPE_ICON[h.type];
        return (
          <li key={`sug-${h.type}-${h.id}`}>
            <button
              type="button"
              onClick={() => onPick(h.href, h.requiresCert)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-surface)] transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-main)] flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate flex items-center gap-2">
                  <span className="truncate">{h.title}</span>
                  {isExternalHref(h.href) && (
                    <ExternalLink
                      className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0"
                      aria-label="Otwiera w nowej karcie"
                    />
                  )}
                </div>
                {h.subtitle && (
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {h.subtitle}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, Trash2 } from "lucide-react";
import Link from "next/link";

import { Badge, useToast } from "@/components/ui";
import { RelativeTime } from "@/components/ui";

interface InboxItem {
  id: string;
  event_key: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
  created_at: string;
  read_at: string | null;
}

const POLL_INTERVAL_MS = 30_000;

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  success: "bg-emerald-500",
};

/**
 * Dzwonek powiadomień. Dropdown jest renderowany przez portal do
 * document.body z fixed positioning + obliczoną pozycją względem przycisku
 * — dzięki temu nie wpada pod kafelki niezależnie od nadrzędnych stacking
 * contextów (header backdrop-blur, hover transform, itd).
 */
export function NotificationBell() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [clearing, setClearing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Trzymamy ID-ki notyfikacji widzianych w poprzednim cyklu — diff vs nowy
  // fetch daje nam nowo-przybyłe powiadomienia, dla których pokazujemy toast.
  // null = pierwsza inicjalizacja (nie spamujemy toastami przy pierwszym
  // load, gdy user otwiera dashboard z N starymi powiadomieniami).
  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/inbox?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      const fetchedItems: InboxItem[] = json.data?.items ?? [];

      // Toast dla nowych notyfikacji (nieobecnych w poprzednim cyklu).
      if (seenIdsRef.current !== null) {
        const newOnes = fetchedItems.filter(
          (it) => !seenIdsRef.current!.has(it.id) && !it.read_at,
        );
        for (const it of newOnes) {
          const tone =
            it.severity === "error"
              ? "error"
              : it.severity === "warning"
                ? "warning"
                : it.severity === "success"
                  ? "success"
                  : "info";
          toast[tone](it.title, it.body);
        }
      }
      seenIdsRef.current = new Set(fetchedItems.map((it) => it.id));

      setItems(fetchedItems);
      setUnread(json.data?.unread ?? 0);
    } catch {
      // ignore
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const iv = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [load]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    function update() {
      const r = buttonRef.current!.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        right: window.innerWidth - r.right,
      });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        buttonRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  async function markAllRead() {
    try {
      await fetch("/api/account/inbox", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((prev) =>
        prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })),
      );
      setUnread(0);
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    if (clearing || items.length === 0) return;
    setClearing(true);
    // Animacja fade-out: stan `clearing` triggeruje opacity:0 + translateX
    // przez ~300ms (tailwind transition). Po animacji DELETE w API + clear
    // local state. seenIdsRef też clear żeby toast nie wystrzelił dla
    // tych samych po następnym fetch.
    setTimeout(async () => {
      try {
        await fetch("/api/account/inbox", {
          method: "DELETE",
          credentials: "include",
        });
        setItems([]);
        setUnread(0);
        seenIdsRef.current = new Set();
      } catch {
        // ignore
      } finally {
        setClearing(false);
      }
    }, 320);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
        aria-label={`Powiadomienia${unread > 0 ? ` (${unread} nieprzeczytanych)` : ""}`}
        title="Powiadomienia"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl animate-fade-in"
            style={{
              top: pos.top,
              right: Math.max(pos.right, 16),
              zIndex: 2147483646,
            }}
            role="dialog"
            aria-label="Lista powiadomień"
          >
            <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-card)]">
              <h3 className="text-sm font-semibold">Powiadomienia</h3>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={clearing}
                    className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                    Zaznacz wszystko
                  </button>
                )}
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={clearing}
                    className="text-xs text-red-400 hover:underline flex items-center gap-1 disabled:opacity-40"
                    title="Wyczyść wszystkie powiadomienia"
                  >
                    <Trash2 className="w-3 h-3" />
                    Wyczyść wszystkie
                  </button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">
                Brak powiadomień.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {items.map((item, idx) => (
                  <li
                    key={item.id}
                    style={{
                      // Stagger fade-out — kolejne wpisy znikają z opóźnieniem
                      // 30ms żeby animacja była "kaskadowa" zamiast pukającego
                      // wszystko-na-raz.
                      transitionDelay: clearing ? `${idx * 30}ms` : "0ms",
                    }}
                    className={`p-3 flex gap-3 transition-all duration-300 ease-out ${
                      item.read_at ? "opacity-70" : ""
                    } ${clearing ? "opacity-0 translate-x-8 pointer-events-none" : ""}`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        SEVERITY_DOT[item.severity] ?? "bg-blue-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-medium text-[var(--text-main)]">
                          {item.title}
                        </span>
                        {!item.read_at && <Badge tone="neutral">Nowe</Badge>}
                      </div>
                      <p className="text-xs text-[var(--text-main)]/80 leading-relaxed">
                        {item.body}
                      </p>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
                        <RelativeTime date={item.created_at} />
                        {" · "}
                        {item.event_key}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="p-2 border-t border-[var(--border-subtle)] text-center sticky bottom-0 bg-[var(--bg-card)]">
              <Link
                href="/account?tab=preferences"
                onClick={() => setOpen(false)}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Zarządzaj typami powiadomień →
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

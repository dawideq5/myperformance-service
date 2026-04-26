"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui";
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

const POLL_INTERVAL_MS = 60_000;

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  success: "bg-emerald-500",
};

/**
 * Dzwonek powiadomień — pobiera mp_inbox per user, wyświetla licznik nieprzeczytanych,
 * po kliknięciu pokazuje rozwijaną listę z ostatnimi 20 wpisami.
 * Auto-refresh co 60 s; po otwarciu dropdownu wszystkie widoczne idą jako read.
 */
export function NotificationBell() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/inbox?limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.data?.items ?? []);
      setUnread(json.data?.unread ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void load();
    const iv = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
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

      {open && (
        <div
          className="absolute right-0 mt-2 w-96 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl z-50 animate-fade-in"
          role="dialog"
          aria-label="Lista powiadomień"
        >
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-card)]">
            <h3 className="text-sm font-semibold">Powiadomienia</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Zaznacz wszystko jako przeczytane
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
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`p-3 flex gap-3 ${item.read_at ? "opacity-70" : ""}`}
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
                      {!item.read_at && (
                        <Badge tone="neutral">Nowe</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
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
        </div>
      )}
    </div>
  );
}

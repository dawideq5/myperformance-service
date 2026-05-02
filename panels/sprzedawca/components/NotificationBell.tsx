"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import {
  Bell,
  Check,
  FileSignature,
  FileText,
  GraduationCap,
  MessageSquare,
  Trash2,
  type LucideIcon,
} from "lucide-react";

/**
 * Panel-side dzwonek powiadomień. Działa identycznie jak w main repo
 * (`components/NotificationBell.tsx`), ale fetch idzie przez `/api/relay/
 * account/inbox` (relay forwarduje Bearer KC do dashboard /api/account/inbox).
 *
 * Różnice względem main repo:
 *  - brak useToast (panele globalnie nie mają toast providera w TopBar)
 *  - brak Badge / RelativeTime z @/components/ui (panele nie mają tej biblioteki)
 *  - wszystko inline z minimalną stylistyką via tailwind + CSS vars.
 */

interface InboxItem {
  id: string;
  event_key: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
  created_at: string;
  read_at: string | null;
}

const POLL_INTERVAL_MS = 10_000; // panele to mobilne — nie spamuj 5s
const RELAY_URL = "/api/relay/account/inbox";

const SEVERITY_DOT: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  success: "bg-emerald-500",
};

interface EventStyle {
  Icon: LucideIcon;
  color: string;
}

const EVENT_KEY_STYLES: Array<{ prefix: string; style: EventStyle }> = [
  { prefix: "chatwoot.", style: { Icon: MessageSquare, color: "text-blue-400" } },
  { prefix: "moodle.", style: { Icon: GraduationCap, color: "text-violet-400" } },
  { prefix: "knowledge.", style: { Icon: FileText, color: "text-emerald-400" } },
  { prefix: "documenso.", style: { Icon: FileSignature, color: "text-amber-400" } },
  { prefix: "documents.", style: { Icon: FileSignature, color: "text-amber-400" } },
];

function getEventStyle(eventKey: string): EventStyle | null {
  for (const { prefix, style } of EVENT_KEY_STYLES) {
    if (eventKey.startsWith(prefix)) return style;
  }
  return null;
}

/** Prosty "x minut temu" — bez bibliotek (np. date-fns) żeby panel pozostał lekki. */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return "przed chwilą";
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
  return `${Math.floor(diff / 86400)} dni temu`;
}

export function NotificationBell() {
  const { status } = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [clearing, setClearing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${RELAY_URL}?limit=20`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      const fetchedItems: InboxItem[] = json.data?.items ?? [];
      setItems(fetchedItems);
      setUnread(json.data?.unread ?? 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
    const iv = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(iv);
  }, [load, status]);

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
      await fetch(RELAY_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((prev) =>
        prev.map((i) => ({
          ...i,
          read_at: i.read_at ?? new Date().toISOString(),
        })),
      );
      setUnread(0);
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    if (clearing || items.length === 0) return;
    setClearing(true);
    setTimeout(async () => {
      try {
        await fetch(RELAY_URL, {
          method: "DELETE",
          credentials: "include",
        });
        setItems([]);
        setUnread(0);
      } catch {
        // ignore
      } finally {
        setClearing(false);
      }
    }, 300);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl transition-colors hover:opacity-90"
        style={{ color: "var(--text-muted, #6b6b7b)" }}
        aria-label={`Powiadomienia${
          unread > 0 ? ` (${unread} nieprzeczytanych)` : ""
        }`}
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
            className="fixed w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] overflow-y-auto rounded-2xl border shadow-2xl"
            style={{
              top: pos.top,
              right: Math.max(pos.right, 16),
              zIndex: 2147483646,
              background: "var(--bg-card, #12121a)",
              borderColor: "var(--border-subtle, #1e1e2e)",
            }}
            role="dialog"
            aria-label="Lista powiadomień"
          >
            <div
              className="flex items-center justify-between p-3 border-b sticky top-0"
              style={{
                background: "var(--bg-card, #12121a)",
                borderColor: "var(--border-subtle, #1e1e2e)",
              }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-main, #f1f1f4)" }}
              >
                Powiadomienia
              </h3>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={clearing}
                    className="text-xs hover:underline flex items-center gap-1 disabled:opacity-40"
                    style={{ color: "var(--accent, #6366f1)" }}
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
                    Wyczyść
                  </button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted, #6b6b7b)" }}
              >
                Brak powiadomień.
              </div>
            ) : (
              <ul
                className="divide-y"
                style={{ borderColor: "var(--border-subtle, #1e1e2e)" }}
              >
                {items.map((item, idx) => (
                  <li
                    key={item.id}
                    style={{
                      transitionDelay: clearing ? `${idx * 30}ms` : "0ms",
                      borderColor: "var(--border-subtle, #1e1e2e)",
                    }}
                    className={`p-3 flex gap-3 transition-all duration-300 ease-out ${
                      item.read_at ? "opacity-70" : ""
                    } ${
                      clearing ? "opacity-0 translate-x-8 pointer-events-none" : ""
                    }`}
                  >
                    {(() => {
                      const evStyle = getEventStyle(item.event_key);
                      if (evStyle) {
                        const { Icon, color } = evStyle;
                        return (
                          <Icon
                            className={`mt-0.5 w-4 h-4 flex-shrink-0 ${color}`}
                            aria-hidden="true"
                          />
                        );
                      }
                      return (
                        <span
                          className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                            SEVERITY_DOT[item.severity] ?? "bg-blue-500"
                          }`}
                          aria-hidden="true"
                        />
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-main, #f1f1f4)" }}
                        >
                          {item.title}
                        </span>
                        {!item.read_at && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: "var(--bg-surface, #14141d)",
                              color: "var(--accent, #6366f1)",
                            }}
                          >
                            Nowe
                          </span>
                        )}
                      </div>
                      <p
                        className="text-xs leading-relaxed"
                        style={{ color: "var(--text-main, #f1f1f4)", opacity: 0.85 }}
                      >
                        {item.body}
                      </p>
                      <div
                        className="text-[10px] mt-1"
                        style={{ color: "var(--text-muted, #6b6b7b)" }}
                      >
                        {timeAgo(item.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { api } from "@/lib/api-client";

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "success" | "warning" | "critical";
}

const TONE: Record<
  Announcement["severity"],
  { icon: typeof Info; classes: string; iconClass: string }
> = {
  info: {
    icon: Info,
    classes:
      "bg-blue-500/10 border-blue-500/30 text-blue-100",
    iconClass: "text-blue-400",
  },
  success: {
    icon: CheckCircle2,
    classes:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-100",
    iconClass: "text-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    classes:
      "bg-amber-500/10 border-amber-500/30 text-amber-100",
    iconClass: "text-amber-400",
  },
  critical: {
    icon: AlertCircle,
    classes:
      "bg-red-500/10 border-red-500/30 text-red-100",
    iconClass: "text-red-400",
  },
};

const STORAGE_KEY = "mp:dismissed-announcements";

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function markDismissed(id: string) {
  try {
    const dismissed = getDismissed();
    dismissed.add(id);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    /* noop */
  }
}

/**
 * Banery z mp_announcements (Directus). Pull przy montażu, dismiss zapisany
 * w sessionStorage (znika do końca sesji przeglądarki, wraca po reopen tab).
 * Severity error nie pozwala na dismiss — admin musi wyłączyć w CMS.
 */
export function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(getDismissed());
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ announcements: Announcement[] }>(
          "/api/cms/announcements",
        );
        if (!cancelled) setItems(r.announcements);
      } catch {
        /* directus offline lub user bez area — banner po prostu nie pokaże się */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="Komunikaty systemowe">
      {visible.map((a) => {
        const tone = TONE[a.severity];
        const Icon = tone.icon;
        const dismissable = a.severity !== "critical";
        return (
          <div
            key={a.id}
            className={`relative rounded-lg border px-4 py-3 flex items-start gap-3 ${tone.classes}`}
            role="alert"
          >
            <Icon
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${tone.iconClass}`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{a.title}</div>
              {a.body && (
                <div className="text-xs opacity-90 mt-1 whitespace-pre-line">
                  {a.body}
                </div>
              )}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={() => {
                  markDismissed(a.id);
                  setDismissed(new Set([...dismissed, a.id]));
                }}
                className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                aria-label="Zamknij komunikat"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

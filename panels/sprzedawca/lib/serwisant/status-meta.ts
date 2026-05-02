import type { ReactNode } from "react";
import { createElement } from "react";
import {
  Archive,
  Ban,
  Bell,
  Calculator,
  CheckCircle2,
  Inbox,
  Package,
  Pause,
  Search,
  Truck,
  Undo2,
  Wrench,
  XCircle,
} from "lucide-react";

/**
 * Mirror `panels/serwisant/lib/serwisant/status-meta.ts` (Wave 21 Faza 1A).
 * Backend (`lib/services.ts`) jest źródłem prawdy dla zbioru statusów —
 * używamy `string` jako klucza i `getStatusMeta` z fallbackiem, tak żeby
 * panel sprzedawcy nie wybuchał gdy backend doda nowy status.
 */
export type ServiceStatus =
  | "received"
  | "diagnosing"
  | "awaiting_quote"
  | "awaiting_parts"
  | "repairing"
  | "testing"
  | "ready"
  | "delivered"
  | "on_hold"
  | "rejected_by_customer"
  | "returned_no_repair"
  | "closed"
  | "cancelled"
  | "archived";

export type StatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "muted";

export interface ServiceStatusMeta {
  id: ServiceStatus;
  label: string;
  tone: StatusTone;
  icon: ReactNode;
  description: string;
}

const ICON_CLASS = "w-3.5 h-3.5";

export const STATUS_META: Record<ServiceStatus, ServiceStatusMeta> = {
  received: {
    id: "received",
    label: "Przyjęte",
    tone: "neutral",
    icon: createElement(Inbox, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Zlecenie zarejestrowane, oczekuje na diagnostę.",
  },
  diagnosing: {
    id: "diagnosing",
    label: "W diagnostyce",
    tone: "info",
    icon: createElement(Search, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Trwa diagnoza usterki.",
  },
  awaiting_quote: {
    id: "awaiting_quote",
    label: "Oczekuje akceptacji wyceny",
    tone: "warning",
    icon: createElement(Calculator, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Wycena wysłana do klienta, czekamy na decyzję.",
  },
  awaiting_parts: {
    id: "awaiting_parts",
    label: "Czeka na części",
    tone: "warning",
    icon: createElement(Package, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Naprawa wstrzymana do dostawy podzespołów.",
  },
  repairing: {
    id: "repairing",
    label: "W naprawie",
    tone: "info",
    icon: createElement(Wrench, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Technik realizuje naprawę.",
  },
  testing: {
    id: "testing",
    label: "Testy końcowe",
    tone: "info",
    icon: createElement(CheckCircle2, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Weryfikacja po naprawie przed wydaniem.",
  },
  ready: {
    id: "ready",
    label: "Gotowe do odbioru",
    tone: "success",
    icon: createElement(Bell, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Urządzenie gotowe do odbioru przez klienta.",
  },
  delivered: {
    id: "delivered",
    label: "Wydane",
    tone: "success",
    icon: createElement(Truck, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Urządzenie odebrane przez klienta.",
  },
  on_hold: {
    id: "on_hold",
    label: "Wstrzymane",
    tone: "muted",
    icon: createElement(Pause, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Zlecenie czasowo wstrzymane.",
  },
  rejected_by_customer: {
    id: "rejected_by_customer",
    label: "Odrzucone przez klienta",
    tone: "danger",
    icon: createElement(XCircle, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Klient nie zaakceptował wyceny lub zakresu naprawy.",
  },
  returned_no_repair: {
    id: "returned_no_repair",
    label: "Zwrócone bez naprawy",
    tone: "muted",
    icon: createElement(Undo2, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Urządzenie wydane bez podejmowania naprawy.",
  },
  closed: {
    id: "closed",
    label: "Zamknięte",
    tone: "muted",
    icon: createElement(Archive, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Zlecenie zamknięte i rozliczone.",
  },
  cancelled: {
    id: "cancelled",
    label: "Anulowane",
    tone: "muted",
    icon: createElement(Ban, { className: ICON_CLASS, "aria-hidden": true }),
    description: "Zlecenie anulowane przed realizacją.",
  },
  archived: {
    id: "archived",
    label: "Zarchiwizowane",
    tone: "muted",
    icon: createElement(Archive, {
      className: ICON_CLASS,
      "aria-hidden": true,
    }),
    description: "Zlecenie przeniesione do archiwum.",
  },
};

const FALLBACK_META: ServiceStatusMeta = {
  id: "received",
  label: "Nieznany status",
  tone: "neutral",
  icon: createElement(Inbox, { className: ICON_CLASS, "aria-hidden": true }),
  description: "Status nierozpoznany przez panel.",
};

/**
 * Bezpieczny dostęp do meta po stringu — gwarantuje brak runtime crashu
 * przy nieznanym statusie (np. backend doda nową wartość).
 */
export function getStatusMeta(status: string): ServiceStatusMeta {
  return (STATUS_META as Record<string, ServiceStatusMeta>)[status] ?? FALLBACK_META;
}

/**
 * Grupy statusów do filter sidebar. Statusy mogą się powtarzać między
 * grupami (np. `awaiting_quote` jest "otwarte" i "oczekujące") — sidebar
 * traktuje to jak nakładające się zbiory.
 */
export const STATUS_GROUPS: Record<
  "open" | "waiting" | "ready" | "finished",
  ServiceStatus[]
> = {
  open: [
    "received",
    "diagnosing",
    "awaiting_quote",
    "awaiting_parts",
    "repairing",
    "testing",
  ],
  waiting: ["on_hold", "awaiting_quote", "awaiting_parts"],
  ready: ["ready"],
  finished: [
    "delivered",
    "closed",
    "cancelled",
    "archived",
    "returned_no_repair",
    "rejected_by_customer",
  ],
};

export const STATUS_GROUP_LABELS: Record<keyof typeof STATUS_GROUPS, string> = {
  open: "Otwarte",
  waiting: "Oczekujące",
  ready: "Gotowe",
  finished: "Zakończone",
};

/**
 * Tailwind klasy per-tone dla badge'ów / lewego bordera w liście.
 * Zachowane jako mapa żeby unikać dynamicznego budowania nazw klas
 * (Tailwind purge nie widziałby ich wtedy w content scan).
 */
export const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate-500/10 text-slate-300 border-slate-500/20",
  info: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  danger: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  muted: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export const TONE_BORDER_CLASS: Record<StatusTone, string> = {
  neutral: "border-l-slate-500",
  info: "border-l-blue-500",
  warning: "border-l-amber-500",
  success: "border-l-emerald-500",
  danger: "border-l-rose-500",
  muted: "border-l-slate-600",
};

export const TONE_DOT_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  danger: "bg-rose-500",
  muted: "bg-slate-600",
};

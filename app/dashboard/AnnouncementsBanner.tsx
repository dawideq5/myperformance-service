import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  listActiveAnnouncements,
  type Announcement,
  type AnnouncementSeverity,
} from "@/lib/announcements";

/**
 * Server-rendered banner kafelków komunikatów. Pobiera aktywne wpisy z
 * Directus przy SSR i wyświetla je full-width na top dashboardu.
 *
 * Każdy kafelek ma efekt glow (box-shadow + animate-pulse-slow)
 * w kolorze odpowiadającym wadze (info/success/warning/critical).
 */
export async function AnnouncementsBanner() {
  const items = await listActiveAnnouncements();
  if (items.length === 0) return null;

  return (
    <div className="space-y-3" aria-label="Komunikaty systemowe">
      {items.map((a) => (
        <AnnouncementTile key={a.id} announcement={a} />
      ))}
    </div>
  );
}

interface SeverityStyle {
  icon: LucideIcon;
  // Kolor akcentu (Tailwind 500) — używany do tła ikonki + obwódki + glow.
  ring: string;
  iconBg: string;
  iconText: string;
  glow: string;
  border: string;
  badge: string;
  label: string;
}

const SEVERITY_STYLE: Record<AnnouncementSeverity, SeverityStyle> = {
  info: {
    icon: Info,
    ring: "ring-blue-500/30",
    iconBg: "bg-blue-500/15",
    iconText: "text-blue-400",
    glow:
      "shadow-[0_0_40px_-5px_rgba(59,130,246,0.45),0_0_20px_-2px_rgba(59,130,246,0.35)]",
    border: "border-blue-500/40",
    badge: "bg-blue-500/15 text-blue-300",
    label: "Informacja",
  },
  success: {
    icon: CheckCircle2,
    ring: "ring-emerald-500/30",
    iconBg: "bg-emerald-500/15",
    iconText: "text-emerald-400",
    glow:
      "shadow-[0_0_40px_-5px_rgba(16,185,129,0.45),0_0_20px_-2px_rgba(16,185,129,0.35)]",
    border: "border-emerald-500/40",
    badge: "bg-emerald-500/15 text-emerald-300",
    label: "Sukces",
  },
  warning: {
    icon: AlertTriangle,
    ring: "ring-amber-500/30",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-400",
    glow:
      "shadow-[0_0_40px_-5px_rgba(245,158,11,0.5),0_0_20px_-2px_rgba(245,158,11,0.4)]",
    border: "border-amber-500/40",
    badge: "bg-amber-500/15 text-amber-300",
    label: "Ostrzeżenie",
  },
  critical: {
    icon: AlertCircle,
    ring: "ring-red-500/40",
    iconBg: "bg-red-500/20",
    iconText: "text-red-400",
    glow:
      "shadow-[0_0_50px_-5px_rgba(239,68,68,0.55),0_0_25px_-2px_rgba(239,68,68,0.45)]",
    border: "border-red-500/50",
    badge: "bg-red-500/15 text-red-300",
    label: "Krytyczne",
  },
};

function AnnouncementTile({ announcement }: { announcement: Announcement }) {
  const s = SEVERITY_STYLE[announcement.severity];
  const Icon = s.icon;
  return (
    <div
      role="alert"
      className={[
        "relative w-full rounded-2xl border-2 p-5 sm:p-6",
        "bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-surface)]",
        "animate-pulse-glow",
        s.border,
        s.glow,
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div
          className={[
            "w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center flex-shrink-0",
            s.iconBg,
            s.iconText,
          ].join(" ")}
        >
          <Icon className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={[
                "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full",
                s.badge,
              ].join(" ")}
            >
              {s.label}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--text-main)]">
            {announcement.title}
          </h2>
          {announcement.body && (
            <p className="text-sm text-[var(--text-muted)] mt-1 whitespace-pre-line">
              {announcement.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import {
  Battery,
  Cable,
  Camera,
  CheckCircle2,
  ClipboardList,
  Code,
  Database,
  HelpCircle,
  KeyRound,
  Mic,
  PackageOpen,
  Shield,
  Smartphone,
  Sparkles,
  Speaker,
  TabletSmartphone,
  Volume2,
  Wrench,
} from "lucide-react";

/** Fallback typy napraw — używane gdy mp_repair_types pusta lub fetch
 * failuje. Po seed w produkcji DB powinien zawierać te same wpisy. */
const FALLBACK_REPAIR_TYPES: RepairTypeApi[] = [
  { code: "EXPERTISE", label: "Ekspertyza", icon: "ClipboardList", color: "#06B6D4", combinableMode: "only_with", combinableWith: ["CLEANING"], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 1 },
  { code: "SCREEN_REPLACEMENT", label: "Wymiana wyświetlacza", icon: "Smartphone", color: "#3b82f6", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 10 },
  { code: "BATTERY_REPLACEMENT", label: "Wymiana baterii", icon: "Battery", color: "#22c55e", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 20 },
  { code: "CHARGING_PORT_REPLACEMENT", label: "Wymiana gniazda ładowania", icon: "Cable", color: "#f59e0b", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 30 },
  { code: "EARPIECE_SPEAKER_REPLACEMENT", label: "Wymiana głośnika rozmów", icon: "Volume2", color: "#a855f7", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 40 },
  { code: "MEDIA_SPEAKER_REPLACEMENT", label: "Wymiana głośnika multimedialnego", icon: "Speaker", color: "#a855f7", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 50 },
  { code: "BACK_PANEL_REPLACEMENT", label: "Wymiana panelu tylnego", icon: "TabletSmartphone", color: "#ef4444", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 60 },
  { code: "FRAME_REPLACEMENT", label: "Wymiana korpusu", icon: "Wrench", color: "#ef4444", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 70 },
  { code: "CAMERA_GLASS_REPLACEMENT", label: "Wymiana szkła aparatu", icon: "Camera", color: "#3b82f6", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 80 },
  { code: "SOFTWARE_FAULT", label: "Usterka oprogramowania", icon: "Code", color: "#06B6D4", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 90 },
  { code: "SIM_SD_SLOT", label: "Gniazdo SIM/SD", icon: "PackageOpen", color: "#f59e0b", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 100 },
  { code: "MICROPHONE_REPLACEMENT", label: "Wymiana mikrofonu", icon: "Mic", color: "#a855f7", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 110 },
  { code: "SIM_TRAY_REPLACEMENT", label: "Wymiana tacki SIM", icon: "PackageOpen", color: "#f59e0b", combinableMode: "yes", combinableWith: [], sumsMode: "yes", sumsWith: [], sortOrder: 120 },
  { code: "DATA_RECOVERY", label: "Odzysk danych", icon: "Database", color: "#06B6D4", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 130 },
  { code: "UNKNOWN_LOCK", label: "Nieznany wzór/kod blokady", icon: "KeyRound", color: "#ef4444", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 140 },
  { code: "FRP_GOOGLE", label: "FRP (usunięcie blokady Google)", icon: "Shield", color: "#ef4444", combinableMode: "yes", combinableWith: [], sumsMode: "only_with", sumsWith: ["CLEANING"], sortOrder: 150 },
  { code: "CLEANING", label: "Czyszczenie urządzenia", icon: "Sparkles", color: "#22c55e", combinableMode: "yes", combinableWith: [], sumsMode: "yes", sumsWith: [], sortOrder: 160 },
  { code: "OTHER", label: "Inne", icon: "HelpCircle", color: "#64748b", combinableMode: "yes", combinableWith: [], sumsMode: "no", sumsWith: [], sortOrder: 999 },
];

export interface RepairTypeApi {
  code: string;
  label: string;
  icon: string;
  color: string;
  description?: string | null;
  defaultWarrantyMonths?: number | null;
  timeMin?: number | null;
  timeMax?: number | null;
  timeUnit?: string;
  combinableMode: "yes" | "no" | "only_with" | "except";
  combinableWith: string[];
  sumsMode: "yes" | "no" | "only_with" | "except";
  sumsWith: string[];
  sortOrder: number;
}

export const EXPERTISE_VALUE = "EXPERTISE";
export const CLEANING_VALUE = "CLEANING";
export const OTHER_VALUE = "OTHER";

const ICON_FALLBACK: Record<string, typeof Smartphone> = {
  ClipboardList,
  Smartphone,
  Battery,
  Cable,
  Volume2,
  Speaker,
  TabletSmartphone,
  Wrench,
  Camera,
  Code,
  PackageOpen,
  Mic,
  Database,
  KeyRound,
  Shield,
  HelpCircle,
  Sparkles,
};

function resolveIcon(name: string): typeof Smartphone {
  const fromLib = (LucideIcons as unknown as Record<string, unknown>)[name];
  if (typeof fromLib === "function" || (typeof fromLib === "object" && fromLib !== null)) {
    return fromLib as typeof Smartphone;
  }
  return ICON_FALLBACK[name] ?? Wrench;
}

/** Hook: lista repair types z DB (z fallback). */
export function useRepairTypes(): { types: RepairTypeApi[]; loading: boolean } {
  const [types, setTypes] = useState<RepairTypeApi[]>(FALLBACK_REPAIR_TYPES);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/relay/repair-types")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (!alive) return;
        if (Array.isArray(j.types) && j.types.length > 0) {
          setTypes(j.types as RepairTypeApi[]);
        }
      })
      .catch(() => {
        /* keep fallback */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { types, loading };
}

/** Backwards-compat — używane w starych call-sites. */
export const REPAIR_TYPES = FALLBACK_REPAIR_TYPES.map((r) => ({
  value: r.code,
  label: r.label,
}));

/** Multi-select chip picker. Wartość = tablica kodów napraw zapisywana
 * w mp_services.description (po serializacji do tekstu). */
export function DescriptionPicker({
  selected,
  customDescription,
  onChange,
  onChangeCustom,
}: {
  selected: string[];
  customDescription: string;
  onChange: (next: string[]) => void;
  onChangeCustom: (text: string) => void;
}) {
  const { types } = useRepairTypes();
  const isOther = selected.includes(OTHER_VALUE);
  const isExpertise = selected.includes(EXPERTISE_VALUE);

  const sortedTypes = useMemo(
    () => [...types].sort((a, b) => a.sortOrder - b.sortOrder),
    [types],
  );

  /** Toggle kodu z respektowaniem combinable rules. */
  const toggle = (code: string) => {
    const t = sortedTypes.find((x) => x.code === code);
    if (!t) return;
    const isSelected = selected.includes(code);
    if (isSelected) {
      onChange(selected.filter((c) => c !== code));
      return;
    }
    // Adding — sprawdź combinable_mode dla wybieranego typu vs istniejących.
    if (t.combinableMode === "no" && selected.length > 0) {
      // EXPERTISE-style: zastąp wszystko nową naprawą.
      onChange([code]);
      return;
    }
    // Sprawdź czy istnieje już jakiś wybór z combinable_mode=no.
    const existingExclusive = selected.find((c) => {
      const e = sortedTypes.find((x) => x.code === c);
      return e?.combinableMode === "no";
    });
    if (existingExclusive) {
      onChange([code]);
      return;
    }
    onChange([...selected, code]);
  };

  /** Czy kod jest disabled (nie da się go wybrać przy aktualnym selection). */
  const isDisabled = (code: string): boolean => {
    if (selected.includes(code)) return false;
    const t = sortedTypes.find((x) => x.code === code);
    if (!t) return false;
    // Gdy istnieje wybrana naprawa exclusive (mode=no), nie pokazuj innych.
    const hasExclusive = selected.some((c) => {
      const e = sortedTypes.find((x) => x.code === c);
      return e?.combinableMode === "no" && c !== code;
    });
    if (hasExclusive) return true;
    // Sprawdź combinable rules tego typu wobec wybranych.
    if (t.combinableMode === "only_with" && selected.length > 0) {
      const allowed = new Set(t.combinableWith);
      return !selected.every((c) => allowed.has(c));
    }
    if (t.combinableMode === "except" && selected.length > 0) {
      const blocked = new Set(t.combinableWith);
      return selected.some((c) => blocked.has(c));
    }
    return false;
  };

  return (
    <div className="space-y-3">
      <span
        className="block text-xs font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        Wybierz usterkę / usługę (możesz zaznaczyć kilka)
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sortedTypes.map((rt) => {
          const Icon = resolveIcon(rt.icon);
          const active = selected.includes(rt.code);
          const disabled = isDisabled(rt.code);
          return (
            <button
              key={rt.code}
              type="button"
              onClick={() => toggle(rt.code)}
              disabled={disabled}
              title={
                disabled
                  ? "Ta naprawa nie łączy się z aktualnym wyborem"
                  : rt.description ?? undefined
              }
              className="p-2.5 rounded-xl border flex items-center gap-2 transition-all duration-200 hover:scale-[1.02] text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${rt.color}33, ${rt.color}14)`
                  : "var(--bg-surface)",
                borderColor: active ? rt.color : "var(--border-subtle)",
                color: active ? "var(--text-main)" : "var(--text-muted)",
                boxShadow: active ? `0 4px 14px ${rt.color}33` : "none",
              }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: active ? `${rt.color}33` : "var(--bg-card)",
                  color: active ? rt.color : "var(--text-muted)",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-medium leading-tight flex-1">
                {rt.label}
              </span>
              {active && (
                <CheckCircle2
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: rt.color }}
                />
              )}
            </button>
          );
        })}
      </div>
      {isOther && (
        <textarea
          value={customDescription}
          onChange={(e) => onChangeCustom(e.target.value)}
          placeholder="Opisz usterkę ręcznie (wybrałeś „Inne&rdquo;)…"
          rows={2}
          className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none focus:border-[var(--accent)] animate-fade-in"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          autoFocus
        />
      )}
      {isExpertise && selected.length === 1 && (
        <p
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Ekspertyza jest wyłącznym typem zlecenia — wybierając inną
          naprawę zastąpisz ekspertyzę.
        </p>
      )}
    </div>
  );
}

/** Zamień listę kodów + custom text na czytelny string description. */
export function serializeRepairTypes(
  selected: string[],
  customText: string,
  types?: RepairTypeApi[],
): string {
  if (selected.length === 0 && !customText.trim()) return "";
  const labelByCode = new Map(
    (types ?? FALLBACK_REPAIR_TYPES).map((t) => [t.code, t.label]),
  );
  const labels = selected
    .filter((c) => c !== OTHER_VALUE)
    .map((c) => labelByCode.get(c) ?? c);
  if (selected.includes(OTHER_VALUE) && customText.trim()) {
    labels.push(`Inne: ${customText.trim()}`);
  } else if (selected.includes(OTHER_VALUE)) {
    labels.push("Inne");
  }
  return labels.join(" · ");
}

/** Deserializuj string description (z DB) do tablicy kodów napraw. Używane
 * przy wczytywaniu serwisu do edycji — żeby chips były pre-zaznaczone. */
export function deserializeRepairTypes(
  description: string | null | undefined,
  types?: RepairTypeApi[],
): { codes: string[]; customText: string } {
  if (!description?.trim()) return { codes: [], customText: "" };
  const labelToCode = new Map(
    (types ?? FALLBACK_REPAIR_TYPES).map((t) => [
      t.label.toLowerCase(),
      t.code,
    ]),
  );
  const parts = description.split(/[·,]/).map((s) => s.trim()).filter(Boolean);
  const codes: string[] = [];
  let customText = "";
  for (const part of parts) {
    if (part.toLowerCase().startsWith("inne:")) {
      codes.push(OTHER_VALUE);
      customText = part.slice(5).trim();
      continue;
    }
    if (part.toLowerCase() === "inne") {
      codes.push(OTHER_VALUE);
      continue;
    }
    const code = labelToCode.get(part.toLowerCase());
    if (code) codes.push(code);
  }
  return { codes: [...new Set(codes)], customText };
}

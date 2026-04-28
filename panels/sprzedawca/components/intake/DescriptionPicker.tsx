"use client";

import { useState } from "react";
import {
  Battery,
  Cable,
  Camera,
  CheckCircle2,
  Code,
  Database,
  Fingerprint,
  HelpCircle,
  KeyRound,
  Mic,
  PackageOpen,
  Shield,
  Smartphone,
  Speaker,
  TabletSmartphone,
  Volume2,
  Wrench,
} from "lucide-react";

/** Predefiniowane typy usterek/usług. NIE zmieniać nazw — to są oficjalne
 * etykiety widoczne na zleceniu. Każda ma ikonę dla szybkiego rozpoznania. */
export const REPAIR_TYPES: { value: string; label: string; Icon: typeof Smartphone }[] = [
  { value: "wymiana_wyswietlacza", label: "Wymiana wyświetlacza", Icon: Smartphone },
  { value: "wymiana_baterii", label: "Wymiana baterii", Icon: Battery },
  { value: "wymiana_gniazda_ladowania", label: "Wymiana gniazda ładowania", Icon: Cable },
  { value: "wymiana_glosnika_rozmow", label: "Wymiana głośnika rozmów", Icon: Volume2 },
  { value: "wymiana_glosnika_multimedialnego", label: "Wymiana głośnika multimedialnego", Icon: Speaker },
  { value: "wymiana_panelu_tylnego", label: "Wymiana panelu tylnego", Icon: TabletSmartphone },
  { value: "wymiana_korpusu", label: "Wymiana korpusu", Icon: Wrench },
  { value: "wymiana_szkla_aparatu", label: "Wymiana szkła aparatu", Icon: Camera },
  { value: "usterka_oprogramowania", label: "Usterka oprogramowania", Icon: Code },
  { value: "gniazdo_sim_sd", label: "Gniazdo SIM/SD", Icon: PackageOpen },
  { value: "wymiana_mikrofonu", label: "Wymiana mikrofonu", Icon: Mic },
  { value: "wymiana_tacki_sim", label: "Wymiana tacki SIM", Icon: PackageOpen },
  { value: "odzysk_danych", label: "Odzysk danych", Icon: Database },
  { value: "nieznany_wzor_kod_blokady", label: "Nieznany wzór/kod blokady", Icon: KeyRound },
  { value: "frp_usuniecie_blokady_google", label: "FRP (usunięcie blokady Google)", Icon: Shield },
  { value: "inne", label: "Inne", Icon: HelpCircle },
];

const OTHER_VALUE = "inne";

/** Multi-select buttons + opcjonalne pole tekstowe gdy "Inne" wybrane.
 * Wartość = JSON-array string (zapisywany w mp_services.description). */
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
  const isOther = selected.includes(OTHER_VALUE);
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
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
        {REPAIR_TYPES.map((rt) => {
          const Icon = rt.Icon;
          const active = selected.includes(rt.value);
          return (
            <button
              key={rt.value}
              type="button"
              onClick={() => toggle(rt.value)}
              className="p-2.5 rounded-xl border flex items-center gap-2 transition-all duration-200 hover:scale-[1.02] text-left"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(168, 85, 247, 0.08))"
                  : "var(--bg-surface)",
                borderColor: active ? "var(--accent)" : "var(--border-subtle)",
                color: active ? "var(--text-main)" : "var(--text-muted)",
                boxShadow: active ? "0 4px 14px rgba(59, 130, 246, 0.18)" : "none",
              }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: active ? "rgba(59, 130, 246, 0.22)" : "var(--bg-card)",
                  color: active ? "#3b82f6" : "var(--text-muted)",
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
                  style={{ color: "#3b82f6" }}
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
    </div>
  );
}

/** Zamienia tablicę value-ów + custom text na czytelny string (description w DB). */
export function serializeRepairTypes(
  selected: string[],
  customText: string,
): string {
  if (selected.length === 0 && !customText.trim()) return "";
  const labels = selected
    .map((v) => REPAIR_TYPES.find((r) => r.value === v)?.label ?? v)
    .filter((l) => l !== "Inne"); // "Inne" replaced przez customText
  if (selected.includes(OTHER_VALUE) && customText.trim()) {
    labels.push(`Inne: ${customText.trim()}`);
  } else if (selected.includes(OTHER_VALUE)) {
    labels.push("Inne");
  }
  return labels.join(" · ");
}

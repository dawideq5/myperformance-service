"use client";

import {
  AlertTriangle,
  Droplets,
  Power,
  ScanFace,
  Smartphone,
  Vibrate,
  Zap,
} from "lucide-react";

const POWER_OPTIONS = [
  { value: "yes", label: "Tak", color: "#22C55E", icon: Power },
  { value: "no", label: "Nie", color: "#EF4444", icon: Power },
  {
    value: "vibrates",
    label: "Wibruje / dźwięk, ale ekran nie reaguje",
    color: "#F59E0B",
    icon: Vibrate,
  },
];

const WATER_OPTIONS = [
  { value: "no", label: "Nie", color: "#22C55E" },
  { value: "yes", label: "Tak", color: "#EF4444" },
  { value: "unknown", label: "Nie wiadomo", color: "#F59E0B" },
];

export interface ChecklistState {
  powers_on?: "yes" | "no" | "vibrates";
  bent?: boolean;
  cracked_front?: boolean;
  cracked_back?: boolean;
  face_touch_id?: boolean;
  water_damage?: "yes" | "no" | "unknown";
  notes?: string;
}

export function ChecklistSection({
  brand,
  checklist,
  chargingCurrent,
  onChangeChecklist,
  onChangeChargingCurrent,
}: {
  brand: string;
  checklist: ChecklistState;
  chargingCurrent: string;
  onChangeChecklist: (c: ChecklistState) => void;
  onChangeChargingCurrent: (v: string) => void;
}) {
  const isApple = brand.toLowerCase() === "apple";
  // Pole "prąd ładowania" pomijane gdy zalanie = tak / nie wiem.
  const showCharging =
    checklist.water_damage === undefined || checklist.water_damage === "no";

  const update = (patch: Partial<ChecklistState>) =>
    onChangeChecklist({ ...checklist, ...patch });

  return (
    <div className="space-y-3">
      <ThreeStateRow
        icon={<Power className="w-4 h-4" />}
        label="Czy urządzenie się włącza?"
        value={checklist.powers_on}
        onChange={(v) => update({ powers_on: v as "yes" | "no" | "vibrates" })}
        options={POWER_OPTIONS}
      />

      <BoolRow
        icon={<Smartphone className="w-4 h-4" />}
        label="Czy urządzenie jest wygięte?"
        value={checklist.bent}
        onChange={(v) => update({ bent: v })}
        positiveBad
      />

      <BoolRow
        icon={<AlertTriangle className="w-4 h-4" />}
        label="Czy urządzenie jest pęknięte z przodu?"
        value={checklist.cracked_front}
        onChange={(v) => update({ cracked_front: v })}
        positiveBad
      />

      <BoolRow
        icon={<AlertTriangle className="w-4 h-4" />}
        label="Czy urządzenie jest pęknięte z tyłu?"
        value={checklist.cracked_back}
        onChange={(v) => update({ cracked_back: v })}
        positiveBad
      />

      {isApple && (
        <BoolRow
          icon={<ScanFace className="w-4 h-4" />}
          label="Czy Face ID / Touch ID działa?"
          value={checklist.face_touch_id}
          onChange={(v) => update({ face_touch_id: v })}
        />
      )}

      <ThreeStateRow
        icon={<Droplets className="w-4 h-4" />}
        label="Czy urządzenie było zalane?"
        value={checklist.water_damage}
        onChange={(v) =>
          update({ water_damage: v as "yes" | "no" | "unknown" })
        }
        options={WATER_OPTIONS}
      />

      {showCharging ? (
        <div
          className="p-3 rounded-xl border flex items-center gap-3 animate-fade-in"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #FBBF2433, #FBBF2411)",
              color: "#F59E0B",
            }}
          >
            <Zap className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Prąd ładowania</p>
            <p
              className="text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Zmierz przy włączeniu ładowarki
            </p>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              max="9.99"
              value={chargingCurrent}
              onChange={(e) =>
                onChangeChargingCurrent(e.target.value)
              }
              placeholder="0.00"
              className="w-20 px-2 py-1.5 rounded-lg border text-sm text-right font-mono outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
            <span
              className="text-xs font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              A
            </span>
          </div>
        </div>
      ) : (
        <div
          className="p-3 rounded-xl border flex items-start gap-3 animate-fade-in"
          style={{
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.04))",
            borderColor: "rgba(245, 158, 11, 0.3)",
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(245, 158, 11, 0.18)",
              color: "#F59E0B",
            }}
          >
            <Droplets className="w-4 h-4" />
          </div>
          <div className="text-xs" style={{ color: "var(--text-main)" }}>
            <p className="font-semibold mb-0.5" style={{ color: "#F59E0B" }}>
              Pomijam pomiar prądu ładowania
            </p>
            <p style={{ color: "var(--text-muted)" }}>
              Z uwagi na potencjalny kontakt z cieczą podłączenie ładowania
              do diagnostyki może być ryzykowne. Pomiń ten krok i zaznacz to w
              diagnostyce serwisanta.
            </p>
          </div>
        </div>
      )}

      <div>
        <span
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          Dodatkowe uwagi do checklisty (opcjonalnie)
        </span>
        <textarea
          value={checklist.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Cokolwiek istotnego, co chcesz zaznaczyć..."
          rows={2}
          className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none focus:border-[var(--accent)]"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        />
      </div>
    </div>
  );
}

function BoolRow({
  icon,
  label,
  value,
  onChange,
  positiveBad,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  positiveBad?: boolean;
}) {
  return (
    <div
      className="p-3 rounded-xl border flex items-center justify-between gap-3"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-main)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Pill
          active={value === false}
          color={positiveBad ? "#22C55E" : "#EF4444"}
          onClick={() => onChange(false)}
        >
          Nie
        </Pill>
        <Pill
          active={value === true}
          color={positiveBad ? "#EF4444" : "#22C55E"}
          onClick={() => onChange(true)}
        >
          Tak
        </Pill>
      </div>
    </div>
  );
}

function ThreeStateRow({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string; color: string }[];
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-main)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Pill
            key={o.value}
            active={value === o.value}
            color={o.color}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full border text-xs font-bold transition-all duration-200 hover:scale-105"
      style={{
        background: active ? `linear-gradient(135deg, ${color}, ${color}dd)` : "transparent",
        color: active ? "#fff" : "var(--text-muted)",
        borderColor: active ? color : "var(--border-subtle)",
        boxShadow: active ? `0 2px 12px ${color}44` : "none",
      }}
    >
      {children}
    </button>
  );
}

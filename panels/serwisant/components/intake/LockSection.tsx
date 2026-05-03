"use client";

import { Hash, Lock, ShieldOff } from "lucide-react";
import { PatternLock } from "./PatternLock";

const OPTIONS = [
  {
    value: "none",
    label: "Brak blokady",
    icon: ShieldOff,
    color: "#22C55E",
  },
  {
    value: "pin",
    label: "Hasło / PIN",
    icon: Hash,
    color: "#0EA5E9",
  },
  {
    value: "pattern",
    label: "Wzór",
    icon: Lock,
    color: "#A855F7",
  },
] as const;

export function LockSection({
  lockType,
  lockCode,
  onChangeType,
  onChangeCode,
}: {
  lockType: string;
  lockCode: string;
  onChangeType: (v: string) => void;
  onChangeCode: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = lockType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChangeType(o.value);
                if (o.value === "none") onChangeCode("");
              }}
              className="p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all duration-200 hover:scale-105"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${o.color}33, ${o.color}11)`
                  : "var(--bg-surface)",
                borderColor: active ? o.color : "var(--border-subtle)",
                color: active ? o.color : "var(--text-muted)",
                boxShadow: active ? `0 4px 16px ${o.color}22` : "none",
              }}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-semibold">{o.label}</span>
            </button>
          );
        })}
      </div>

      {lockType === "pin" && (
        <div className="animate-fade-in">
          <span
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Wpisz hasło / PIN
          </span>
          <input
            type="text"
            value={lockCode}
            onChange={(e) => onChangeCode(e.target.value)}
            placeholder="np. 1234, AbcdEfgh, opis"
            className="w-full px-3 py-2 rounded-xl border text-base font-mono outline-none focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
              letterSpacing: "0.05em",
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {lockType === "pattern" && (
        <div className="animate-fade-in">
          <span
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Narysuj wzór odblokowujący
          </span>
          <PatternLock value={lockCode} onChange={onChangeCode} />
        </div>
      )}
    </div>
  );
}

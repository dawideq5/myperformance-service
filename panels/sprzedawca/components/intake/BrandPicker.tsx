"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

/** Logo SVG inline — uproszczone monochrome wersje znaków rozpoznawczych marek.
 * Każde logo akceptuje currentColor żeby reagowało na active/disabled state. */

const AppleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
    <path d="M17.05 12.04a4.92 4.92 0 0 1 2.34-4.13 5.04 5.04 0 0 0-3.96-2.14c-1.67-.17-3.27.99-4.12.99-.86 0-2.16-.97-3.55-.94A5.31 5.31 0 0 0 3.27 8.55c-1.92 3.32-.49 8.21 1.36 10.91.91 1.32 1.97 2.8 3.36 2.74 1.36-.06 1.87-.88 3.51-.88s2.1.88 3.54.85c1.46-.03 2.39-1.34 3.28-2.66 1.04-1.52 1.46-3.01 1.49-3.08-.04-.02-2.85-1.1-2.88-4.39M14.3 4.4a4.86 4.86 0 0 0 1.11-3.48 4.96 4.96 0 0 0-3.21 1.66 4.65 4.65 0 0 0-1.14 3.36c1.32.1 2.65-.66 3.24-1.54Z" />
  </svg>
);
const SamsungLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <text
      x="32"
      y="42"
      fontSize="16"
      fontWeight="700"
      letterSpacing="-1"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      SAMSUNG
    </text>
  </svg>
);
const XiaomiLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <rect x="6" y="6" width="52" height="52" rx="14" fill="none" stroke="currentColor" strokeWidth="3" />
    <text
      x="32"
      y="42"
      fontSize="22"
      fontWeight="700"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      Mi
    </text>
  </svg>
);
const OppoLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <text
      x="32"
      y="42"
      fontSize="20"
      fontWeight="700"
      letterSpacing="-1"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      OPPO
    </text>
  </svg>
);
const MotorolaLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="3">
    <circle cx="32" cy="32" r="22" />
    <path d="M16 38 L24 26 L32 38 L40 26 L48 38" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const GoogleLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <text
      x="32"
      y="42"
      fontSize="22"
      fontWeight="700"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      G
    </text>
  </svg>
);
const RealmeLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <text
      x="32"
      y="42"
      fontSize="14"
      fontWeight="700"
      letterSpacing="-1"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      realme
    </text>
  </svg>
);
const HonorLogo = () => (
  <svg viewBox="0 0 64 64" className="w-7 h-7" fill="currentColor">
    <text
      x="32"
      y="42"
      fontSize="16"
      fontWeight="700"
      letterSpacing="-1"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      HONOR
    </text>
  </svg>
);
const OtherLogo = () => (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
);

export const BRANDS = [
  { value: "Apple", label: "Apple", Logo: AppleLogo, color: "#A3A3A3" },
  { value: "Samsung", label: "Samsung", Logo: SamsungLogo, color: "#1428A0" },
  { value: "Xiaomi", label: "Xiaomi", Logo: XiaomiLogo, color: "#FF6900" },
  { value: "Oppo", label: "OPPO", Logo: OppoLogo, color: "#1ECA90" },
  { value: "Motorola", label: "Motorola", Logo: MotorolaLogo, color: "#5C92FA" },
  { value: "Google", label: "Google", Logo: GoogleLogo, color: "#4285F4" },
  { value: "Realme", label: "Realme", Logo: RealmeLogo, color: "#FFC915" },
  { value: "Honor", label: "Honor", Logo: HonorLogo, color: "#5BC2E7" },
  { value: "__other__", label: "Inne", Logo: OtherLogo, color: "#94A3B8" },
];

/** Wybór marki + ewentualne pole "manualne" dla "Inne". */
export function BrandPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Określa czy aktualna wartość pasuje do jednej z predefiniowanych marek;
  // jeśli nie — to user wybrał "Inne" i wpisuje ręcznie.
  const matched = BRANDS.find(
    (b) => b.value !== "__other__" && b.value.toLowerCase() === value.toLowerCase(),
  );
  const [otherMode, setOtherMode] = useState(!!value && !matched);
  const [otherValue, setOtherValue] = useState(matched ? "" : value);

  useEffect(() => {
    if (otherMode) onChange(otherValue);
  }, [otherMode, otherValue, onChange]);

  return (
    <div>
      <span
        className="block text-xs font-medium mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        Marka
      </span>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
        {BRANDS.map((b) => {
          const Logo = b.Logo;
          const active =
            b.value === "__other__"
              ? otherMode
              : !otherMode && value.toLowerCase() === b.value.toLowerCase();
          return (
            <button
              key={b.value}
              type="button"
              onClick={() => {
                if (b.value === "__other__") {
                  setOtherMode(true);
                  if (matched) setOtherValue("");
                } else {
                  setOtherMode(false);
                  onChange(b.value);
                }
              }}
              className="aspect-[4/3] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:scale-105"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${b.color}33, ${b.color}11)`
                  : "var(--bg-surface)",
                borderColor: active ? b.color : "var(--border-subtle)",
                color: active ? b.color : "var(--text-muted)",
                boxShadow: active ? `0 4px 16px ${b.color}22` : "none",
              }}
            >
              <Logo />
              <span className="text-[10px] font-semibold tracking-wide">
                {b.label}
              </span>
            </button>
          );
        })}
      </div>
      {otherMode && (
        <div className="animate-fade-in">
          <div className="relative">
            <Plus
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={otherValue}
              onChange={(e) => setOtherValue(e.target.value)}
              placeholder="Wpisz markę ręcznie (np. Vivo, Nokia, OnePlus)"
              className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none focus:border-[var(--accent)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

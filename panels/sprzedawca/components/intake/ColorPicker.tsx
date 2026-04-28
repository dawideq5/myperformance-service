"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";

/** Mapa nazwa → hex dla approximate matching. Polskie nazwy. */
const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: "Czarny", hex: "#0a0a0a" },
  { name: "Grafitowy", hex: "#3a3a3a" },
  { name: "Biały", hex: "#fafafa" },
  { name: "Srebrny", hex: "#c0c0c0" },
  { name: "Kosmiczny szary", hex: "#5d5e60" },
  { name: "Tytanowy naturalny", hex: "#8d8d80" },
  { name: "Tytanowy niebieski", hex: "#3b4d5d" },
  { name: "Tytanowy biały", hex: "#e8e7df" },
  { name: "Tytanowy czarny", hex: "#252525" },
  { name: "Złoty", hex: "#d4af37" },
  { name: "Różowo-złoty", hex: "#e8b6a0" },
  { name: "Niebieski", hex: "#1d63ff" },
  { name: "Niebieski głęboki", hex: "#0a4d8a" },
  { name: "Granatowy", hex: "#1a2649" },
  { name: "Błękitny", hex: "#7fb3e0" },
  { name: "Turkusowy", hex: "#37c8ab" },
  { name: "Zielony", hex: "#1f9d55" },
  { name: "Zielony pacyficzny", hex: "#3a796e" },
  { name: "Czerwony", hex: "#d8202d" },
  { name: "Bordowy", hex: "#7a1f23" },
  { name: "Pomarańczowy", hex: "#ff7a1c" },
  { name: "Żółty", hex: "#f7c948" },
  { name: "Fioletowy", hex: "#7a4cb5" },
  { name: "Lawendowy", hex: "#c4b6e8" },
  { name: "Różowy", hex: "#f4adcd" },
  { name: "Miedziany", hex: "#b56e3f" },
  { name: "Beżowy", hex: "#d6c4a3" },
  { name: "Brązowy", hex: "#7b4e2a" },
];

/** Najbliższy kolor z palety w przestrzeni RGB (Euclidean distance). */
function closestColorName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let best = NAMED_COLORS[0];
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const cRgb = hexToRgb(c.hex);
    if (!cRgb) continue;
    const d =
      (rgb[0] - cRgb[0]) ** 2 +
      (rgb[1] - cRgb[1]) ** 2 +
      (rgb[2] - cRgb[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.name;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const v = hex.replace("#", "");
  if (v.length !== 6) return null;
  const r = parseInt(v.substring(0, 2), 16);
  const g = parseInt(v.substring(2, 4), 16);
  const b = parseInt(v.substring(4, 6), 16);
  if ([r, g, b].some(isNaN)) return null;
  return [r, g, b];
}

/** Color picker — open native input[type=color], convert hex → najbliższa
 * polska nazwa, zapisz nazwę do state. Pokazuje też swatch i preview. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [hex, setHex] = useState<string>("#0a0a0a");
  const inputRef = useRef<HTMLInputElement>(null);
  const popularColors = [
    "Czarny",
    "Biały",
    "Srebrny",
    "Tytanowy naturalny",
    "Niebieski",
    "Złoty",
    "Zielony",
    "Czerwony",
  ];

  // Jeśli value pasuje do jednego z named — wyciągnij hex jako visualizer.
  useEffect(() => {
    const named = NAMED_COLORS.find(
      (c) => c.name.toLowerCase() === value.toLowerCase(),
    );
    if (named) setHex(named.hex);
  }, [value]);

  return (
    <div>
      <span
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        Kolor
      </span>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border text-sm transition-colors hover:border-[var(--accent)]"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <Palette className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <span
            className="w-6 h-6 rounded-full border flex-shrink-0"
            style={{
              background: hex,
              borderColor: "var(--border-subtle)",
            }}
          />
          <span className="flex-1 text-left">
            {value || "Wybierz kolor z palety"}
          </span>
          <span
            className="text-[10px] uppercase font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            paleta
          </span>
          <input
            ref={inputRef}
            type="color"
            value={hex}
            onChange={(e) => {
              setHex(e.target.value);
              onChange(closestColorName(e.target.value));
            }}
            className="sr-only"
          />
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="lub wpisz nazwę"
          className="w-32 px-3 py-2 rounded-xl border text-sm outline-none focus:border-[var(--accent)]"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {popularColors.map((name) => {
          const c = NAMED_COLORS.find((x) => x.name === name);
          if (!c) return null;
          const active = value.toLowerCase() === name.toLowerCase();
          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(name);
                setHex(c.hex);
              }}
              className="px-2.5 py-1 rounded-full border text-[11px] flex items-center gap-1.5 transition-all hover:scale-105"
              style={{
                background: active ? "var(--accent)" : "var(--bg-surface)",
                borderColor: active ? "var(--accent)" : "var(--border-subtle)",
                color: active ? "#fff" : "var(--text-main)",
              }}
            >
              <span
                className="w-3 h-3 rounded-full inline-block border"
                style={{
                  background: c.hex,
                  borderColor: "var(--border-subtle)",
                }}
              />
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { ChevronDown } from "lucide-react";

/** Lista marek + akcent kolorystyczny (używany przez 3D model body color). */
export const BRANDS = [
  { value: "Apple", label: "Apple", color: "#A3A3A3" },
  { value: "Samsung", label: "Samsung", color: "#1428A0" },
  { value: "Xiaomi", label: "Xiaomi", color: "#FF6900" },
  { value: "Oppo", label: "OPPO", color: "#1ECA90" },
  { value: "Motorola", label: "Motorola", color: "#5C92FA" },
  { value: "Google", label: "Google", color: "#4285F4" },
  { value: "Realme", label: "Realme", color: "#FFC915" },
  { value: "Honor", label: "Honor", color: "#5BC2E7" },
];

const OTHER = "__other__";

/** Dropdown z marką + warunkowe pole "Inne" do ręcznego wpisania. */
export function BrandPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const matched = BRANDS.find(
    (b) => b.value.toLowerCase() === value.toLowerCase(),
  );
  const otherMode = !!value && !matched;
  const selectValue = matched ? matched.value : otherMode ? OTHER : "";

  return (
    <div className="space-y-2">
      <label className="block">
        <span
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          Marka
        </span>
        <div className="relative">
          <select
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTHER) {
                onChange("");
              } else {
                onChange(v);
              }
            }}
            className="w-full appearance-none px-3 py-2 pr-9 rounded-xl border text-sm outline-none transition-colors focus:border-[var(--accent)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            <option value="">— Wybierz markę —</option>
            {BRANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
            <option value={OTHER}>Inne (wpisz ręcznie)</option>
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      </label>
      {(otherMode || selectValue === OTHER) && (
        <input
          type="text"
          value={otherMode ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Wpisz markę ręcznie (np. Vivo, Nokia, OnePlus)"
          className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-[var(--accent)]"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Phone } from "lucide-react";

/** Lista krajów z dialing code i flagą emoji. Polska na pierwszym miejscu
 * (default). Dodatkowo CEE + popularne. */
const COUNTRIES: { code: string; dial: string; flag: string; name: string }[] = [
  { code: "PL", dial: "+48", flag: "🇵🇱", name: "Polska" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Niemcy" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "Wielka Brytania" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "Stany Zjednoczone" },
  { code: "UA", dial: "+380", flag: "🇺🇦", name: "Ukraina" },
  { code: "BY", dial: "+375", flag: "🇧🇾", name: "Białoruś" },
  { code: "CZ", dial: "+420", flag: "🇨🇿", name: "Czechy" },
  { code: "SK", dial: "+421", flag: "🇸🇰", name: "Słowacja" },
  { code: "LT", dial: "+370", flag: "🇱🇹", name: "Litwa" },
  { code: "LV", dial: "+371", flag: "🇱🇻", name: "Łotwa" },
  { code: "RO", dial: "+40", flag: "🇷🇴", name: "Rumunia" },
  { code: "HU", dial: "+36", flag: "🇭🇺", name: "Węgry" },
  { code: "AT", dial: "+43", flag: "🇦🇹", name: "Austria" },
  { code: "CH", dial: "+41", flag: "🇨🇭", name: "Szwajcaria" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "Francja" },
  { code: "ES", dial: "+34", flag: "🇪🇸", name: "Hiszpania" },
  { code: "IT", dial: "+39", flag: "🇮🇹", name: "Włochy" },
  { code: "NL", dial: "+31", flag: "🇳🇱", name: "Holandia" },
  { code: "BE", dial: "+32", flag: "🇧🇪", name: "Belgia" },
  { code: "NO", dial: "+47", flag: "🇳🇴", name: "Norwegia" },
  { code: "SE", dial: "+46", flag: "🇸🇪", name: "Szwecja" },
  { code: "DK", dial: "+45", flag: "🇩🇰", name: "Dania" },
  { code: "FI", dial: "+358", flag: "🇫🇮", name: "Finlandia" },
  { code: "IE", dial: "+353", flag: "🇮🇪", name: "Irlandia" },
];

const DEFAULT_DIAL = "+48";

/** Rozdziela pełen numer "+48 600 100 200" → { dial: "+48", local: "600100200" }.
 * Dopasowuje najdłuższy znany prefix, fallback PL. */
function parsePhone(full: string): { dial: string; local: string } {
  const v = full.trim();
  if (!v) return { dial: DEFAULT_DIAL, local: "" };
  // Sortuj prefixy malejąco długością — żeby +380 wygrał z +38, +1 nie zjadł +12 itp.
  const dials = [...COUNTRIES.map((c) => c.dial)].sort(
    (a, b) => b.length - a.length,
  );
  for (const d of dials) {
    if (v.startsWith(d)) {
      return { dial: d, local: v.slice(d.length).replace(/\D/g, "") };
    }
  }
  // Brak prefixu — traktuj jako lokalny PL.
  return { dial: DEFAULT_DIAL, local: v.replace(/\D/g, "") };
}

export function PhoneInputWithFlags({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parsePhone(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const country = COUNTRIES.find((c) => c.dial === parsed.dial) ?? COUNTRIES[0];

  // Click outside → close dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const setDial = (dial: string) => {
    onChange(`${dial} ${parsed.local}`.trim());
    setOpen(false);
  };

  const setLocal = (local: string) => {
    const clean = local.replace(/\D/g, "");
    onChange(`${parsed.dial} ${clean}`.trim());
  };

  return (
    <label className="block">
      <span
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        Telefon
      </span>
      <div className="relative" ref={containerRef}>
        <div
          className="flex items-stretch rounded-xl border overflow-hidden focus-within:border-[var(--accent)] transition-colors"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {/* Country selector — flag + dial code. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-2 border-r hover:bg-[var(--bg-card)] transition-colors flex-shrink-0"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
            aria-label="Wybierz kraj"
          >
            <span className="text-lg leading-none">{country.flag}</span>
            <span className="text-xs font-mono">{country.dial}</span>
            <ChevronDown
              className="w-3 h-3"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
          {/* Phone icon + input. */}
          <div className="relative flex-1">
            <Phone
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="tel"
              inputMode="numeric"
              value={parsed.local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="600 100 200"
              className="w-full pl-9 pr-3 py-2 text-sm outline-none bg-transparent"
              style={{ color: "var(--text-main)" }}
              autoComplete="tel"
            />
          </div>
        </div>

        {/* Dropdown z listą krajów. */}
        {open && (
          <div
            className="absolute left-0 top-full mt-1 z-30 rounded-xl border shadow-2xl max-h-64 overflow-y-auto w-64"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setDial(c.dial)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-surface)] transition-colors text-left"
                style={{
                  color: "var(--text-main)",
                  background:
                    c.dial === parsed.dial ? "var(--bg-surface)" : "transparent",
                }}
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="flex-1">{c.name}</span>
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {c.dial}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

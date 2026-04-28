"use client";

import { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";

/** Flagi jako CSS gradients — Windows nie renderuje Unicode regional
 * indicator emoji jako flagi (pokazują się jako 2 litery). Dla każdego
 * kraju definiujemy listę kolorów (paski poziome). Dla flag z bardziej
 * skomplikowaną strukturą (UK/US) używamy uproszczenia 3-paskowego.
 *
 * Schemat: ["color1", "color2"] = 2 paski (50/50)
 *          ["c1","c2","c3"]      = 3 paski (33/34/33)
 *          ["c1","c2","c3","c4"] = 4 paski (równo)
 */
const FLAG_STRIPES: Record<string, string[]> = {
  PL: ["#FFFFFF", "#DC143C"],
  DE: ["#000000", "#DD0000", "#FFCE00"],
  GB: ["#012169", "#FFFFFF", "#C8102E"], // uproszczone
  US: ["#B22234", "#FFFFFF", "#3C3B6E"], // uproszczone
  UA: ["#0057B7", "#FFD700"],
  BY: ["#CE1720", "#007C30"],
  CZ: ["#FFFFFF", "#D7141A", "#11457E"],
  SK: ["#FFFFFF", "#0B4EA2", "#EE1C25"],
  LT: ["#FDB913", "#006A44", "#C1272D"],
  LV: ["#9E1B32", "#FFFFFF", "#9E1B32"],
  RO: ["#002B7F", "#FCD116", "#CE1126"],
  HU: ["#CE2939", "#FFFFFF", "#477050"],
  AT: ["#ED2939", "#FFFFFF", "#ED2939"],
  CH: ["#DA291C"], // single color tło (uproszczone)
  FR: ["#0055A4", "#FFFFFF", "#EF4135"], // pionowe ale renderujemy poziomo
  ES: ["#AA151B", "#F1BF00", "#AA151B"],
  IT: ["#008C45", "#FFFFFF", "#CD212A"],
  NL: ["#AE1C28", "#FFFFFF", "#21468B"],
  BE: ["#000000", "#FAE042", "#ED2939"],
  NO: ["#EF2B2D", "#FFFFFF", "#002868"],
  SE: ["#006AA7", "#FECC00", "#006AA7"],
  DK: ["#C8102E", "#FFFFFF", "#C8102E"],
  FI: ["#FFFFFF", "#003580", "#FFFFFF"],
  IE: ["#169B62", "#FFFFFF", "#FF883E"],
};

function CountryFlag({ code, size = "md" }: { code: string; size?: "sm" | "md" }) {
  const stripes = FLAG_STRIPES[code] ?? ["#888"];
  const dim =
    size === "sm" ? "w-4 h-3 rounded-[2px]" : "w-5 h-3.5 rounded-[3px]";
  let bg = stripes[0];
  if (stripes.length === 2) {
    bg = `linear-gradient(to bottom, ${stripes[0]} 0 50%, ${stripes[1]} 50% 100%)`;
  } else if (stripes.length === 3) {
    bg = `linear-gradient(to bottom, ${stripes[0]} 0 33.34%, ${stripes[1]} 33.34% 66.67%, ${stripes[2]} 66.67% 100%)`;
  } else if (stripes.length === 4) {
    bg = `linear-gradient(to bottom, ${stripes[0]} 0 25%, ${stripes[1]} 25% 50%, ${stripes[2]} 50% 75%, ${stripes[3]} 75% 100%)`;
  }
  return (
    <span
      className={`inline-block flex-shrink-0 border border-black/10 ${dim}`}
      style={{ background: bg }}
      aria-label={`Flaga ${code}`}
      role="img"
    />
  );
}

const COUNTRIES: { code: string; dial: string; name: string }[] = [
  { code: "PL", dial: "+48", name: "Polska" },
  { code: "DE", dial: "+49", name: "Niemcy" },
  { code: "GB", dial: "+44", name: "Wielka Brytania" },
  { code: "US", dial: "+1", name: "Stany Zjednoczone" },
  { code: "UA", dial: "+380", name: "Ukraina" },
  { code: "BY", dial: "+375", name: "Białoruś" },
  { code: "CZ", dial: "+420", name: "Czechy" },
  { code: "SK", dial: "+421", name: "Słowacja" },
  { code: "LT", dial: "+370", name: "Litwa" },
  { code: "LV", dial: "+371", name: "Łotwa" },
  { code: "RO", dial: "+40", name: "Rumunia" },
  { code: "HU", dial: "+36", name: "Węgry" },
  { code: "AT", dial: "+43", name: "Austria" },
  { code: "CH", dial: "+41", name: "Szwajcaria" },
  { code: "FR", dial: "+33", name: "Francja" },
  { code: "ES", dial: "+34", name: "Hiszpania" },
  { code: "IT", dial: "+39", name: "Włochy" },
  { code: "NL", dial: "+31", name: "Holandia" },
  { code: "BE", dial: "+32", name: "Belgia" },
  { code: "NO", dial: "+47", name: "Norwegia" },
  { code: "SE", dial: "+46", name: "Szwecja" },
  { code: "DK", dial: "+45", name: "Dania" },
  { code: "FI", dial: "+358", name: "Finlandia" },
  { code: "IE", dial: "+353", name: "Irlandia" },
];

const DEFAULT_DIAL = "+48";

function parsePhone(full: string): { dial: string; local: string } {
  const v = full.trim();
  if (!v) return { dial: DEFAULT_DIAL, local: "" };
  const dials = [...COUNTRIES.map((c) => c.dial)].sort(
    (a, b) => b.length - a.length,
  );
  for (const d of dials) {
    if (v.startsWith(d)) {
      return { dial: d, local: v.slice(d.length).replace(/\D/g, "") };
    }
  }
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
  const country = COUNTRIES.find((c) => c.dial === parsed.dial) ?? COUNTRIES[0];

  const setDial = (dial: string) => {
    onChange(`${dial} ${parsed.local}`.trim());
    setOpen(false);
  };

  const setLocal = (local: string) => {
    const clean = local.replace(/\D/g, "");
    onChange(`${parsed.dial} ${clean}`.trim());
  };

  return (
    <div className="block">
      <span
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        Telefon
      </span>
      <div className="relative">
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
            <CountryFlag code={country.code} />
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

        {/* Backdrop + dropdown. Backdrop łapie wszystkie kliknięcia poza
            dropdownem i go zamyka — niezawodnie na touch i mouse. */}
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div
              className="absolute left-0 top-full mt-1 z-50 rounded-xl border shadow-2xl max-h-64 overflow-y-auto w-64"
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
                      c.dial === parsed.dial
                        ? "var(--bg-surface)"
                        : "transparent",
                  }}
                >
                  <CountryFlag code={c.code} />
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
          </>
        )}
      </div>
    </div>
  );
}

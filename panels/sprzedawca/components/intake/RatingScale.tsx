"use client";

/** Skala 1-10 z opisem labela per liczbę. Domyślnie używamy szablonu opisów
 * dla "ogólny stan elementu" (1=zniszczony, 10=jak nowy). Można podać własne
 * `descriptions` dla danego komponentu (np. dla wyspy aparatów). */

const DEFAULT_DESCRIPTIONS: Record<number, string> = {
  1: "Całkowicie zniszczony",
  2: "Bardzo poważne uszkodzenia",
  3: "Liczne pęknięcia / głębokie rysy",
  4: "Pęknięcia, ale element funkcjonuje",
  5: "Wyraźne rysy widoczne pod każdym kątem",
  6: "Drobne rysy widoczne w ostrym świetle",
  7: "Ślady normalnego użytkowania",
  8: "Bardzo dobry stan, drobne mikro-rysy",
  9: "Praktycznie idealny",
  10: "Nowy, jak prosto z pudełka",
};

export const DISPLAY_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskany — nie reaguje albo pokazuje obraz fragmentarycznie",
  2: "Liczne pęknięcia, dotyk tylko częściowo działa",
  3: "Wiele pęknięć i głębokich rys, dotyk działa z perturbacjami",
  4: "Pojedyncze pęknięcie, dotyk i obraz działa w pełni",
  5: "Wyraźne rysy na całej powierzchni, ale ekran sprawny",
  6: "Drobne rysy widoczne pod kątem, ekran w pełni sprawny",
  7: "Lekkie ślady użytkowania, mikro-rysy w rogach",
  8: "Bardzo dobry stan, kilka mikro-rys widocznych tylko w lupie",
  9: "Praktycznie idealny",
  10: "Jak nowy, prosto z pudełka",
};

export const BACK_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskana tylna szyba",
  2: "Liczne pęknięcia, plecek wymaga wymiany",
  3: "Pęknięcia + głębokie rysy",
  4: "Pojedyncze pęknięcie",
  5: "Wyraźne rysy widoczne pod każdym kątem",
  6: "Drobne rysy w odbiciu światła",
  7: "Lekkie ślady użytkowania",
  8: "Bardzo dobry stan, mikro-rysy",
  9: "Praktycznie idealny",
  10: "Jak nowy",
};

export const CAMERA_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskane szkiełka, aparat nie ostrzy",
  2: "Pęknięte szkiełka, plamy w zdjęciach",
  3: "Pęknięte szkiełko jednego obiektywu",
  4: "Głębokie rysy na szkiełkach",
  5: "Wyraźne rysy widoczne na zdjęciach pod światło",
  6: "Drobne rysy, zdjęcia OK",
  7: "Lekkie ślady kurzu, obiektywy sprawne",
  8: "Bardzo dobry stan",
  9: "Praktycznie idealny",
  10: "Jak nowy",
};

export const FRAMES_DESCRIPTIONS: Record<number, string> = {
  1: "Wgnieceniem zdeformowane, ramka pęknięta",
  2: "Liczne wgniecenia, deformacje krawędzi",
  3: "Głębokie wgniecenia, otarcia pokrywy",
  4: "Wgniecenia + otarcia ramki",
  5: "Liczne otarcia w narożach",
  6: "Drobne otarcia widoczne pod światło",
  7: "Lekkie ślady użytkowania",
  8: "Bardzo dobry stan, mikro-otarcia",
  9: "Praktycznie idealny",
  10: "Jak nowy",
};

interface RatingScaleProps {
  value?: number;
  onChange: (v: number) => void;
  descriptions?: Record<number, string>;
  /** Etykieta pokazywana nad slider'em (np. "Stan ekranu"). */
  label?: string;
}

function colorForScore(n: number): string {
  if (n <= 2) return "#7f1d1d";
  if (n <= 4) return "#EF4444";
  if (n <= 6) return "#F59E0B";
  if (n <= 8) return "#0EA5E9";
  return "#22C55E";
}

export function RatingScale({
  value,
  onChange,
  descriptions = DEFAULT_DESCRIPTIONS,
  label,
}: RatingScaleProps) {
  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs uppercase tracking-wider text-white/60 font-semibold">
          {label}
        </p>
      )}
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          const c = colorForScore(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="aspect-square rounded-lg border text-xs font-bold transition-all hover:scale-110"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${c}, ${c}cc)`
                  : "rgba(255,255,255,0.05)",
                borderColor: active ? c : "rgba(255,255,255,0.1)",
                color: active ? "#fff" : "rgba(255,255,255,0.7)",
                boxShadow: active ? `0 4px 14px ${c}66` : "none",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-white/50">
        <span>zniszczony</span>
        <span>jak nowy</span>
      </div>
      {value && (
        <div
          className="rounded-xl border p-2.5 animate-fade-in"
          style={{
            background: `linear-gradient(135deg, ${colorForScore(value)}22, ${colorForScore(value)}08)`,
            borderColor: `${colorForScore(value)}55`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{
                background: colorForScore(value),
                color: "#fff",
              }}
            >
              {value}
            </span>
            <p className="text-xs text-white/85 leading-snug">
              {descriptions[value] ?? DEFAULT_DESCRIPTIONS[value] ?? ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

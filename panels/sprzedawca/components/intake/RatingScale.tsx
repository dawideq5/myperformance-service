"use client";

/** Skala 1-10 z OPISAMI WIDOCZNYMI POD KAŻDĄ OCENĄ. User widzi wszystkie
 * możliwe opisy i wybiera ten odpowiadający stanowi. Opisy rzeczowe,
 * profesjonalne — bez hiperboli ani niepotrzebnych adjectives. */

const DEFAULT_DESCRIPTIONS: Record<number, string> = {
  1: "Element całkowicie zniszczony, nie spełnia funkcji.",
  2: "Bardzo poważne uszkodzenia ograniczające użytkowanie.",
  3: "Liczne pęknięcia lub głębokie rysy.",
  4: "Pojedyncze pęknięcie, element funkcjonuje.",
  5: "Wyraźne rysy widoczne pod każdym kątem.",
  6: "Drobne rysy widoczne tylko w określonym oświetleniu.",
  7: "Ślady normalnego użytkowania.",
  8: "Bardzo dobry stan, mikro-rysy.",
  9: "Praktycznie idealny stan.",
  10: "Stan jak nowy, bez śladów użytkowania.",
};

export const DISPLAY_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskany ekran, brak reakcji na dotyk lub obraz fragmentaryczny.",
  2: "Liczne pęknięcia, dotyk reaguje częściowo.",
  3: "Wiele pęknięć i głębokich rys, dotyk z perturbacjami.",
  4: "Pojedyncze pęknięcie, dotyk i obraz w pełni sprawne.",
  5: "Wyraźne rysy na całej powierzchni, ekran sprawny.",
  6: "Drobne rysy widoczne pod kątem, ekran w pełni sprawny.",
  7: "Lekkie ślady użytkowania, mikro-rysy w rogach.",
  8: "Bardzo dobry stan, kilka mikro-rys widocznych pod lupą.",
  9: "Praktycznie bez śladów użytkowania.",
  10: "Stan jak nowy.",
};

export const BACK_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskany panel tylny.",
  2: "Liczne pęknięcia, panel wymaga wymiany.",
  3: "Pęknięcia oraz głębokie rysy.",
  4: "Pojedyncze pęknięcie.",
  5: "Wyraźne rysy widoczne pod każdym kątem.",
  6: "Drobne rysy w odbiciu światła.",
  7: "Lekkie ślady użytkowania.",
  8: "Bardzo dobry stan, mikro-rysy.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
};

export const CAMERA_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskane szkiełka obiektywów, aparat nie ostrzy.",
  2: "Pęknięte szkiełka, plamy widoczne na zdjęciach.",
  3: "Pęknięte szkiełko jednego z obiektywów.",
  4: "Głębokie rysy na szkiełkach.",
  5: "Wyraźne rysy widoczne na zdjęciach pod światło.",
  6: "Drobne rysy, jakość zdjęć bez zauważalnych problemów.",
  7: "Lekkie ślady użytkowania, obiektywy sprawne.",
  8: "Bardzo dobry stan szkiełek.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
};

export const FRAMES_DESCRIPTIONS: Record<number, string> = {
  1: "Ramka pęknięta lub silnie zdeformowana.",
  2: "Liczne wgniecenia, deformacja krawędzi.",
  3: "Głębokie wgniecenia, otarcia powłoki.",
  4: "Wgniecenia oraz otarcia ramki.",
  5: "Liczne otarcia w narożach.",
  6: "Drobne otarcia widoczne pod światło.",
  7: "Lekkie ślady użytkowania.",
  8: "Bardzo dobry stan, mikro-otarcia.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
};

interface RatingScaleProps {
  value?: number;
  onChange: (v: number) => void;
  descriptions?: Record<number, string>;
  /** Etykieta nad listą. */
  label?: string;
}

function colorForScore(n: number): string {
  if (n <= 2) return "#7f1d1d";
  if (n <= 4) return "#EF4444";
  if (n <= 6) return "#F59E0B";
  if (n <= 8) return "#0EA5E9";
  return "#22C55E";
}

/** Renderuje pełną listę 10 ocen z opisami widocznymi od razu. User klika
 * całą wierszową kafelkę żeby wybrać. Aktywny wiersz ma kolor i lewą belkę. */
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
      <div className="space-y-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          const c = colorForScore(n);
          const desc = descriptions[n] ?? DEFAULT_DESCRIPTIONS[n] ?? "";
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="w-full text-left p-2.5 rounded-xl border transition-all duration-200 flex items-start gap-3 hover:bg-white/5"
              style={{
                background: active
                  ? `linear-gradient(90deg, ${c}33, transparent 60%)`
                  : "rgba(255,255,255,0.03)",
                borderColor: active ? c : "rgba(255,255,255,0.08)",
                boxShadow: active ? `inset 4px 0 0 ${c}` : "none",
              }}
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: active ? c : "rgba(255,255,255,0.06)",
                  color: active ? "#fff" : "rgba(255,255,255,0.7)",
                }}
              >
                {n}
              </span>
              <span
                className="text-xs leading-snug pt-1"
                style={{
                  color: active
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(255,255,255,0.6)",
                }}
              >
                {desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Animowane logo "MyPerformance" ↔ nazwa aktualnego widoku.
 *
 * Algorytm "morfowania":
 *  - Każda litera jest renderowana jako osobny <span> w siatce o szerokości
 *    max(currentLen, nextLen) + indeks pozycji.
 *  - Litera, która istnieje w obu napisach na tej samej pozycji → animacja
 *    "fade w miejscu" (kolor / opacity stałe, transition tylko gdy się zmienia).
 *  - Litera dodana w nowym napisie → spada z góry (translateY -16 → 0,
 *    opacity 0 → 1).
 *  - Litera usunięta z poprzedniego napisu → upada w dół (translateY 0 → 16,
 *    opacity 1 → 0) i znika z DOM po animacji.
 *
 * Animacja jest realizowana przez CSS transitions (transform + opacity).
 * Bez Framer Motion — mniej zależności, lepsza wydajność.
 */
export function AnimatedLogoMorph({
  primary,
  secondary,
  intervalMs = 2000,
  durationMs = 600,
  className = "",
}: {
  /** Bazowy napis (np. "MyPerformance"). */
  primary: string;
  /** Drugi napis (np. nazwa widoku). */
  secondary: string;
  /** Co ile ms zmienić tekst (default 2000). */
  intervalMs?: number;
  /** Długość pojedynczej animacji w ms (default 600). */
  durationMs?: number;
  className?: string;
}) {
  // Toggle między 0 (primary) a 1 (secondary).
  const [phase, setPhase] = useState(0);

  // Reset do primary gdy secondary się zmienia (np. nawigacja).
  useEffect(() => {
    setPhase(0);
  }, [secondary]);

  useEffect(() => {
    if (!secondary || secondary === primary) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p === 0 ? 1 : 0));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [primary, secondary, intervalMs]);

  const current = phase === 0 ? primary : secondary;
  const previous = phase === 0 ? secondary : primary;

  // Każda pozycja ma "klucz" — index. Dla każdej pozycji liczymy:
  //  - litera teraz   (current[i] | undefined)
  //  - litera wcześniej (previous[i] | undefined)
  // Renderujemy max(len) spanów; gdy liter brakuje używamy &nbsp; aby
  // zachować layout.
  const positions = useMemo(() => {
    const max = Math.max(current.length, previous.length);
    const arr: Array<{
      idx: number;
      letter: string;
      prevLetter: string | null;
      kind: "stable" | "enter" | "exit";
    }> = [];
    for (let i = 0; i < max; i++) {
      const letter = current[i] ?? "";
      const prevLetter = previous[i] ?? "";
      let kind: "stable" | "enter" | "exit" = "stable";
      if (letter && !prevLetter) kind = "enter";
      else if (!letter && prevLetter) kind = "exit";
      else if (letter !== prevLetter) kind = "enter";
      arr.push({
        idx: i,
        letter,
        prevLetter: prevLetter || null,
        kind,
      });
    }
    return arr;
  }, [current, previous]);

  return (
    <span
      className={`inline-flex items-center font-bold text-lg tracking-tight select-none ${className}`}
      aria-label={current}
      style={{ minWidth: 0 }}
    >
      {positions.map(({ idx, letter, kind }) => {
        const isSpace = letter === " " || letter === "";
        return (
          <span
            key={idx}
            className="inline-block"
            style={{
              minWidth: isSpace ? "0.35em" : undefined,
              transition: `transform ${durationMs}ms cubic-bezier(0.34,1.56,0.64,1), opacity ${durationMs}ms ease-out`,
              transform:
                kind === "enter"
                  ? "translateY(0)"
                  : kind === "exit"
                    ? "translateY(16px)"
                    : "translateY(0)",
              opacity: letter ? 1 : 0,
              animation:
                kind === "enter"
                  ? `mp-letter-drop ${durationMs}ms ease-out`
                  : undefined,
            }}
          >
            {letter || "\u00A0"}
          </span>
        );
      })}
    </span>
  );
}

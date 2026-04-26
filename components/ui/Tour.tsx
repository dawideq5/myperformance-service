"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "./Button";

export interface TourStep {
  /** CSS selector dla `[data-tour="..."]` lub ogólny — pierwszy match wygrywa.
   *  Brak = krok floating na środku. */
  element?: string;
  title: string;
  /** Krótki opis — różny od OnboardingCard, mówi „spróbuj" / „kliknij". */
  body: string;
  /** Dłuższe wyjaśnienie pokazywane jeśli user kliknie „Więcej". */
  more?: string;
  /** Akcja zachęcająca interakcję — etykieta przycisku który NIE next-uje
   *  trasy, tylko np. open dropdown. Po kliknięciu user dalej rusza Next. */
  cta?: { label: string; onClick: () => void };
  /** Nie zaciemniaj target — pozwól na klik. Default true. */
  allowInteraction?: boolean;
}

interface TourProps {
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
  /** Identyfikator trasy — używany do label'a w stopce. */
  label?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Brandowany tour matching dashboard style (var(--bg-card)/accent/text-main).
 * Funkcje:
 *   - tooltip pozycjonowany pod/nad/obok target elementu
 *   - dziura w overlayu (clip-path) z miękkim pierścieniem podświetlenia
 *   - klawiatura: ←/→ next/prev, ESC zamyka, Enter = next
 *   - allow interaction (default true): user może kliknąć target
 *   - progres bar + numeracja kroków
 *   - smooth scroll do targetu jeśli poza viewportem
 *   - portal do body z z-index 2147483645 (poniżej notification dropdown
 *     żeby nie blokować notyfikacji w trakcie tour)
 */
export function Tour({ steps, open, onClose, label }: TourProps) {
  const [current, setCurrent] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    arrowSide: "top" | "bottom" | "left" | "right";
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setCurrent(0);
  }, [open]);

  const step = steps[current];

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.element) {
      setTargetRect(null);
      setTooltipPos({
        top: window.innerHeight / 2 - 100,
        left: window.innerWidth / 2 - 200,
        arrowSide: "top",
      });
      return;
    }
    const el = document.querySelector(step.element) as HTMLElement | null;
    if (!el) {
      // skip step if element missing
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
    // Scroll do target jeśli poza viewportem
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(measure, 350);
    }
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // Pozycjonowanie tooltipa po pomiarze targetu
  useLayoutEffect(() => {
    if (!targetRect || !tooltipRef.current) return;
    const tt = tooltipRef.current.getBoundingClientRect();
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Spróbuj poniżej; jeśli nie pasuje, powyżej; jeśli nie, po prawej
    let top = targetRect.top + targetRect.height + margin;
    let left = targetRect.left + targetRect.width / 2 - tt.width / 2;
    let arrowSide: "top" | "bottom" | "left" | "right" = "top";
    if (top + tt.height > vh - margin) {
      top = targetRect.top - tt.height - margin;
      arrowSide = "bottom";
    }
    if (top < margin) {
      // Jeśli w pionie nigdzie nie pasuje, postaw obok
      top = targetRect.top + targetRect.height / 2 - tt.height / 2;
      left = targetRect.left + targetRect.width + margin;
      arrowSide = "left";
      if (left + tt.width > vw - margin) {
        left = targetRect.left - tt.width - margin;
        arrowSide = "right";
      }
    }
    left = Math.min(Math.max(left, margin), vw - tt.width - margin);
    setTooltipPos({ top, left, arrowSide });
  }, [targetRect]);

  // Klawiatura
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose(false);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, steps.length]);

  function next() {
    if (current < steps.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      onClose(true);
    }
  }
  function prev() {
    setCurrent((c) => Math.max(0, c - 1));
  }

  if (!mounted || !open || !step) return null;

  const allowInteraction = step.allowInteraction ?? true;
  const progress = ((current + 1) / steps.length) * 100;

  // Spotlight overlay — robi „dziurę" w ciemnej masce dookoła targetu
  const spotlightStyle: React.CSSProperties | undefined = targetRect
    ? {
        position: "fixed",
        top: targetRect.top - 8,
        left: targetRect.left - 8,
        width: targetRect.width + 16,
        height: targetRect.height + 16,
        borderRadius: 14,
        boxShadow:
          "0 0 0 9999px rgba(8, 12, 24, 0.72), 0 0 0 3px var(--accent), 0 0 30px 8px rgba(99, 102, 241, 0.45)",
        zIndex: 2147483640,
        pointerEvents: allowInteraction ? "none" : "auto",
        transition:
          "top 0.3s cubic-bezier(.4,0,.2,1), left 0.3s cubic-bezier(.4,0,.2,1), width 0.3s cubic-bezier(.4,0,.2,1), height 0.3s cubic-bezier(.4,0,.2,1)",
      }
    : undefined;

  // Brak targetu = pełnoekranowy backdrop pod tooltipem
  const fullBackdropStyle: React.CSSProperties | undefined = !targetRect
    ? {
        position: "fixed",
        inset: 0,
        background: "rgba(8, 12, 24, 0.72)",
        zIndex: 2147483640,
        pointerEvents: "auto",
      }
    : undefined;

  return createPortal(
    <>
      {spotlightStyle && <div aria-hidden="true" style={spotlightStyle} />}
      {fullBackdropStyle && (
        <div aria-hidden="true" style={fullBackdropStyle} onClick={() => onClose(false)} />
      )}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-label={`${label ?? "Przewodnik"}: krok ${current + 1} z ${steps.length}`}
        className="mp-tour-tooltip"
        style={{
          position: "fixed",
          top: tooltipPos?.top ?? 0,
          left: tooltipPos?.left ?? 0,
          zIndex: 2147483641,
          maxWidth: "min(420px, calc(100vw - 32px))",
          background: "var(--bg-card)",
          border: "1px solid var(--accent)",
          borderRadius: 16,
          boxShadow:
            "0 24px 60px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(99, 102, 241, 0.25)",
          padding: 20,
          color: "var(--text-main)",
          opacity: tooltipPos ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold mb-1">
              {label ?? "Przewodnik"} · krok {current + 1}/{steps.length}
            </div>
            <h3 className="text-base font-bold text-[var(--text-main)] leading-tight">
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="p-1.5 -m-1.5 rounded-md text-[var(--text-main)]/60 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition-colors"
            aria-label="Zamknij przewodnik"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[var(--text-main)]/90 leading-relaxed mb-4">
          {step.body}
        </p>

        {step.more && (
          <details className="mb-4 text-xs text-[var(--text-main)]/75 leading-relaxed">
            <summary className="cursor-pointer text-[var(--accent)] hover:underline mb-2 select-none">
              Więcej szczegółów
            </summary>
            <p className="pt-1">{step.more}</p>
          </details>
        )}

        {step.cta && (
          <div className="mb-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={step.cta.onClick}
            >
              {step.cta.label}
            </Button>
          </div>
        )}

        <div className="h-1 rounded-full bg-[var(--bg-surface)] overflow-hidden mb-3">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={current === 0}
            onClick={prev}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Wstecz
          </Button>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="text-xs text-[var(--text-main)]/60 hover:text-[var(--text-main)] underline"
          >
            Pomiń
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={next}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            {current === steps.length - 1 ? "Zakończ" : "Dalej"}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}

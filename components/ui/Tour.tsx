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
  element?: string;
  title: string;
  body: string;
  more?: string;
  allowInteraction?: boolean;
}

interface TourProps {
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
  label?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top: number;
  left: number;
}

/**
 * Stabilny tour: jedna miara per step (po instant-scrollu targetu do
 * środka), brak listenerów scroll. Tooltip i spotlight są fixed,
 * pozycjonowane od jednego pomiaru — żeby nic nie skakało.
 */
export function Tour({ steps, open, onClose, label }: TourProps) {
  const [current, setCurrent] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setCurrent(0);
  }, [open]);

  const step = steps[current];

  // Zmierz target raz per step. Jeśli element nie istnieje albo brak
  // selektora — tooltip floating na środku.
  useLayoutEffect(() => {
    if (!open || !step) return;
    let cancelled = false;

    function doMeasure() {
      if (cancelled) return;
      if (!step!.element) {
        setTargetRect(null);
        return;
      }
      const el = document.querySelector(step!.element) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const out =
        r.bottom < 80 ||
        r.top > window.innerHeight - 80 ||
        r.right < 0 ||
        r.left > window.innerWidth;
      if (out) {
        // Instant scroll — bez animacji, żeby nic nie skakało potem.
        el.scrollIntoView({ behavior: "auto", block: "center" });
        // Pomiar po klatce — DOM ma już zsynchronizowaną pozycję.
        requestAnimationFrame(() => {
          if (cancelled) return;
          const r2 = el.getBoundingClientRect();
          setTargetRect({
            top: r2.top,
            left: r2.left,
            width: r2.width,
            height: r2.height,
          });
        });
        return;
      }
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    }

    doMeasure();

    function onResize() {
      doMeasure();
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [open, step]);

  // Pozycjonowanie tooltipa — po jednym przebiegu pomiaru targetu.
  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }
    const tt = tooltipRef.current.getBoundingClientRect();
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Brak targetu = floating na środku
    if (!targetRect) {
      setTooltipPos({
        top: Math.max(margin, vh / 2 - tt.height / 2),
        left: Math.max(margin, vw / 2 - tt.width / 2),
      });
      return;
    }

    // Spróbuj poniżej > powyżej > obok
    let top = targetRect.top + targetRect.height + margin;
    let left = targetRect.left + targetRect.width / 2 - tt.width / 2;
    if (top + tt.height > vh - margin) {
      top = targetRect.top - tt.height - margin;
    }
    if (top < margin) {
      // Jeśli pionowo nie wchodzi, połóż obok środka pionowego targetu.
      top = Math.max(
        margin,
        Math.min(
          targetRect.top + targetRect.height / 2 - tt.height / 2,
          vh - tt.height - margin,
        ),
      );
      left = targetRect.left + targetRect.width + margin;
      if (left + tt.width > vw - margin) {
        left = targetRect.left - tt.width - margin;
      }
    }
    left = Math.min(Math.max(left, margin), vw - tt.width - margin);
    top = Math.min(Math.max(top, margin), vh - tt.height - margin);
    setTooltipPos({ top, left });
  }, [targetRect, open, current]);

  const next = useCallback(() => {
    if (current < steps.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      onClose(true);
    }
  }, [current, steps.length, onClose]);

  const prev = useCallback(() => {
    setCurrent((c) => Math.max(0, c - 1));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  if (!mounted || !open || !step) return null;

  const allowInteraction = step.allowInteraction ?? true;
  const progress = ((current + 1) / steps.length) * 100;

  // Spotlight overlay: dziura w masce dookoła targetu.
  const spotlight = targetRect ? (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: targetRect.top - 8,
        left: targetRect.left - 8,
        width: targetRect.width + 16,
        height: targetRect.height + 16,
        borderRadius: 14,
        boxShadow:
          "0 0 0 9999px rgba(8, 12, 24, 0.74), 0 0 0 3px var(--accent), 0 0 24px 6px rgba(99, 102, 241, 0.45)",
        zIndex: 2147483640,
        pointerEvents: allowInteraction ? "none" : "auto",
      }}
    />
  ) : (
    <div
      aria-hidden="true"
      onClick={() => onClose(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8, 12, 24, 0.74)",
        zIndex: 2147483640,
      }}
    />
  );

  return createPortal(
    <>
      {spotlight}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={`${label ?? "Przewodnik"}: krok ${current + 1} z ${steps.length}`}
        style={{
          position: "fixed",
          top: tooltipPos?.top ?? 0,
          left: tooltipPos?.left ?? 0,
          zIndex: 2147483641,
          maxWidth: "min(440px, calc(100vw - 32px))",
          background: "var(--bg-card)",
          border: "1px solid var(--accent)",
          borderRadius: 16,
          boxShadow:
            "0 24px 60px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(99, 102, 241, 0.25)",
          padding: 20,
          color: "var(--text-main)",
          opacity: tooltipPos ? 1 : 0,
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
            className="p-1.5 -m-1.5 rounded-md text-[var(--text-main)]/70 hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition-colors"
            aria-label="Zamknij przewodnik"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[var(--text-main)] leading-relaxed mb-4 whitespace-pre-line">
          {step.body}
        </p>

        {step.more && (
          <details className="mb-4 text-xs text-[var(--text-main)]/85 leading-relaxed">
            <summary className="cursor-pointer text-[var(--accent)] hover:underline mb-2 select-none">
              Więcej szczegółów
            </summary>
            <p className="pt-1 whitespace-pre-line">{step.more}</p>
          </details>
        )}

        <div className="h-1 rounded-full bg-[var(--bg-surface)] overflow-hidden mb-3">
          <div
            className="h-full bg-[var(--accent)]"
            style={{ width: `${progress}%`, transition: "width 0.25s ease" }}
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
            className="text-xs text-[var(--text-main)]/70 hover:text-[var(--text-main)] underline"
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

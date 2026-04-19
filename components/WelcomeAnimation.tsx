"use client";

import { useEffect, useRef, useState } from "react";

type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface WelcomeAnimationProps {
  firstName: string;
  lastName: string;
  /** Fires when the morph + text handoff is complete and the panel should fade in. */
  onRevealPanel: () => void;
  /** Fires when the overlay has fully faded and can be unmounted. */
  onDone: () => void;
}

// Canonical durations. Tuned so each property eases into the next without overlap.
const TIMINGS = {
  mount: 80,
  witajIn: 900,
  firstIn: 1000,
  morph: 1200,
  handoff: 900,
  reveal: 700,
  fadeout: 700,
} as const;

const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const REDUCED_EASE = "ease-out";

/**
 * Fullscreen arrival animation — "Witaj {First} {Last}" that morphs into the
 * dashboard heading. Optimized for zero layout thrash:
 *
 *   · the wrapper is the only positioned element (absolute → target)
 *   · text chunks animate via max-width + opacity only
 *   · panel reveal is sequenced AFTER the text handoff settles (no overlap)
 *   · overlay then cross-fades out — the underlying <h1> remains in place
 *
 * Phases:
 *   0 mount → 1 Witaj in → 2 First in → 3 morph to anchor →
 *   4 Witaj out / Last in (text handoff) → 5 panel reveals → 6 overlay fades
 */
export function WelcomeAnimation({
  firstName,
  lastName,
  onRevealPanel,
  onDone,
}: WelcomeAnimationProps) {
  const [phase, setPhase] = useState<Phase>(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const revealedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      // Honour OS preference — jump straight to the final state.
      setPhase(6);
      onRevealPanel();
      const t = setTimeout(onDone, 200);
      return () => clearTimeout(t);
    }

    let t = TIMINGS.mount;
    const schedule: Array<[number, Phase]> = [
      [t, 1],
      [(t += TIMINGS.witajIn), 2],
      [(t += TIMINGS.firstIn), 3],
      [(t += TIMINGS.morph), 4],
      [(t += TIMINGS.handoff), 5],
      [(t += TIMINGS.reveal), 6],
    ];

    const timers = schedule.map(([at, p]) => setTimeout(() => setPhase(p), at));
    const doneAt = t + TIMINGS.fadeout;
    timers.push(setTimeout(onDone, doneAt));
    return () => timers.forEach(clearTimeout);
  }, [onDone, onRevealPanel, reducedMotion]);

  useEffect(() => {
    if (phase >= 5 && !revealedRef.current) {
      revealedRef.current = true;
      onRevealPanel();
    }
  }, [phase, onRevealPanel]);

  const showWitaj = phase >= 1 && phase < 4;
  const showFirst = phase >= 2;
  const showLast = phase >= 4 && lastName.length > 0;
  const atFinal = phase >= 3;
  const fading = phase >= 6;

  const ease = reducedMotion ? REDUCED_EASE : EASE;
  const morphMs = TIMINGS.morph;
  const textMs = TIMINGS.handoff - 150; // finish slightly before phase 5 starts

  return (
    <div
      className="fixed inset-0 z-[100] bg-[var(--bg-main)]"
      aria-hidden={fading}
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${TIMINGS.fadeout}ms ${ease}`,
        pointerEvents: fading ? "none" : "auto",
        willChange: "opacity",
      }}
    >
      <div
        className="fixed font-bold tracking-tight text-[var(--text-main)] whitespace-nowrap text-3xl"
        style={{
          // Target anchor matches the real <h1> inside PageShell(maxWidth="xl"):
          //   header h-16 (64px) + main py-8 top (32px) = 96px.
          //   main max-w-6xl (72rem) + px-6 (1.5rem) centered.
          top: atFinal ? "96px" : "50%",
          left: atFinal
            ? "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))"
            : "50%",
          transform: atFinal
            ? "translate3d(0, 0, 0) scale(1)"
            : "translate3d(-50%, -50%, 0) scale(2.4)",
          transformOrigin: "center center",
          opacity: phase === 0 ? 0 : 1,
          lineHeight: "2.25rem",
          transition: [
            `top ${morphMs}ms ${ease}`,
            `left ${morphMs}ms ${ease}`,
            `transform ${morphMs}ms ${ease}`,
            `opacity 400ms ${ease}`,
          ].join(", "),
          willChange: phase < 6 ? "transform, top, left, opacity" : "auto",
          backfaceVisibility: "hidden",
          contain: "layout paint",
        }}
      >
        <span
          className="inline-block overflow-hidden align-baseline"
          style={{
            opacity: showWitaj ? 1 : 0,
            maxWidth: showWitaj ? "20ch" : "0ch",
            marginRight: showWitaj ? "0.35em" : "0em",
            transition: [
              `opacity ${textMs}ms ${ease}`,
              `max-width ${textMs}ms ${ease}`,
              `margin-right ${textMs}ms ${ease}`,
            ].join(", "),
          }}
        >
          Witaj
        </span>
        <span
          className="inline-block overflow-hidden align-baseline"
          style={{
            opacity: showFirst ? 1 : 0,
            maxWidth: showFirst ? "30ch" : "0ch",
            transition: [
              `opacity ${textMs}ms ${ease}`,
              `max-width ${textMs}ms ${ease}`,
            ].join(", "),
          }}
        >
          {firstName}
        </span>
        <span
          className="inline-block overflow-hidden align-baseline"
          style={{
            opacity: showLast ? 1 : 0,
            maxWidth: showLast ? "30ch" : "0ch",
            marginLeft: showLast ? "0.35em" : "0em",
            transition: [
              `opacity ${textMs}ms ${ease}`,
              `max-width ${textMs}ms ${ease}`,
              `margin-left ${textMs}ms ${ease}`,
            ].join(", "),
          }}
        >
          {lastName}
        </span>
      </div>
    </div>
  );
}

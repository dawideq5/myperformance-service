"use client";

import { useEffect, useRef, useState } from "react";

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

interface WelcomeAnimationProps {
  firstName: string;
  lastName: string;
  /** Fires when the text reaches the final heading anchor and the panel should fade in. */
  onRevealPanel: () => void;
  /** Fires when the overlay has fully faded and can be unmounted. */
  onDone: () => void;
}

/**
 * Fullscreen arrival animation. Performance-first: the container is a single
 * transformed element; only `transform`, `top`, `left`, `opacity`, `max-width`
 * and `margin` transition. No font-size animation — text stays at its final
 * size throughout and the container is scaled instead, so the paint is
 * GPU-composited the whole way through.
 *
 * Timeline (~5s):
 *   0 →  100ms   mount
 *   100 → 1100   "Witaj" fades in, centered + scaled
 *  1100 → 2300   "{First}" expands in alongside Witaj
 *  2300 → 3600   container morphs (scale → 1, position → h1 anchor)
 *  3600 → 4600   "Witaj " collapses out, "{Last}" expands in, panel fades in
 *  4600 → 5100   overlay fades to transparent
 */
export function WelcomeAnimation({
  firstName,
  lastName,
  onRevealPanel,
  onDone,
}: WelcomeAnimationProps) {
  const [phase, setPhase] = useState<Phase>(0);
  const revealedRef = useRef(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 2300),
      setTimeout(() => setPhase(4), 3600),
      setTimeout(() => setPhase(5), 4600),
      setTimeout(() => onDone(), 5100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  useEffect(() => {
    if (phase >= 4 && !revealedRef.current) {
      revealedRef.current = true;
      onRevealPanel();
    }
  }, [phase, onRevealPanel]);

  const showWitaj = phase >= 1 && phase < 4;
  const showFirst = phase >= 2;
  const showLast = phase >= 4 && lastName.length > 0;
  const atFinal = phase >= 3;

  const morphMs = 1300;
  const textMs = 750;
  const ease = "cubic-bezier(0.65, 0, 0.35, 1)";

  return (
    <div
      className="fixed inset-0 z-[100] bg-[var(--bg-main)]"
      aria-hidden={phase >= 5}
      style={{
        opacity: phase >= 5 ? 0 : 1,
        transition: "opacity 500ms ease",
        pointerEvents: phase >= 5 ? "none" : "auto",
      }}
    >
      <div
        className="fixed font-bold tracking-tight text-[var(--text-main)] whitespace-nowrap text-3xl"
        style={{
          // Final anchor matches the real <h1> in PageShell(max-w-6xl / px-6):
          // header h-16 (64px) + main py-8 top (32px) = 96px.
          top: atFinal ? "96px" : "50%",
          left: atFinal
            ? "max(1.5rem, calc((100vw - 72rem) / 2 + 1.5rem))"
            : "50%",
          // Centered state: translate(-50%,-50%) keeps the element visually
          // centered regardless of its current width — so "Witaj" alone and
          // "Witaj {First}" both sit at the viewport center with no drift.
          transform: atFinal
            ? "translate(0, 0) scale(1)"
            : "translate(-50%, -50%) scale(2.4)",
          transformOrigin: "center center",
          opacity: phase === 0 ? 0 : 1,
          lineHeight: "2.25rem",
          transition: [
            `top ${morphMs}ms ${ease}`,
            `left ${morphMs}ms ${ease}`,
            `transform ${morphMs}ms ${ease}`,
            `opacity 500ms ease`,
          ].join(", "),
          willChange: "transform, top, left, opacity",
          backfaceVisibility: "hidden",
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

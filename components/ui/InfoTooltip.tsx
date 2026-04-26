"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle, Info } from "lucide-react";

interface InfoTooltipProps {
  /** Tekst lub bogatszy node z wyjaśnieniem. */
  content: ReactNode;
  /** Ikona — domyślnie ⓘ. `help` da znak zapytania. */
  variant?: "info" | "help";
  /** Jeśli podane — tooltip pokazuje się obok tekstu zamiast ikony. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Lekki, accessible tooltip z hover/focus + click-to-pin. Działa też na
 * mobile (tap pokazuje, drugi tap na zewnątrz chowa). Pozycjonowanie
 * fixed względem ikony — nie wycina się przy overflow:hidden.
 */
export function InfoTooltip({
  content,
  variant = "info",
  label,
  side = "top",
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const padding = 8;
    let top = 0;
    let left = 0;
    if (side === "top") {
      top = rect.top - padding;
      left = rect.left + rect.width / 2;
    } else if (side === "bottom") {
      top = rect.bottom + padding;
      left = rect.left + rect.width / 2;
    } else if (side === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - padding;
    } else {
      top = rect.top + rect.height / 2;
      left = rect.right + padding;
    }
    setPos({ top, left });
  }, [open, side]);

  useEffect(() => {
    if (!pinned) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [pinned]);

  const Icon = variant === "help" ? HelpCircle : Info;

  return (
    <>
      <button
        type="button"
        ref={ref}
        aria-label="Pokaż wyjaśnienie"
        onMouseEnter={() => !pinned && setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setPinned((p) => !p);
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition ${className ?? ""}`}
      >
        {label && <span className="text-xs">{label}</span>}
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && pos && (
        <div
          role="tooltip"
          className="fixed z-50 max-w-xs px-3 py-2 rounded-lg bg-[#0c0c0e] border border-[var(--border-subtle)] shadow-xl text-xs leading-relaxed text-[var(--text-main)]"
          style={{
            top: pos.top,
            left: pos.left,
            transform:
              side === "top"
                ? "translate(-50%, -100%)"
                : side === "bottom"
                  ? "translate(-50%, 0)"
                  : side === "left"
                    ? "translate(-100%, -50%)"
                    : "translate(0, -50%)",
            pointerEvents: pinned ? "auto" : "none",
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}

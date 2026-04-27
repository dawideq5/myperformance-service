"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
  labelledById?: string;
}

const sizeClassName: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  labelledById,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Stable handle for onClose — depending on onClose directly would
  // re-run the effect on every parent re-render and steal focus back to
  // the dialog shell (breaks typing in inputs).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div
      // z-[2000] żeby Dialog był ponad Leaflet (default zoom controls
      // z-index: 1000, popup-pane: 700, marker-pane: 600). Bez tego mapa
      // pod modalem przebijała się przez backdrop.
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
    >
      <div
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={contentRef}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl",
          "animate-slide-up outline-none",
          sizeClassName[size],
        )}
      >
        {(title || description) && (
          <header className="flex items-start justify-between gap-4 mb-5">
            <div className="flex-1 min-w-0">
              {title && (
                <h3
                  id={labelledById}
                  className="text-lg font-semibold text-[var(--text-main)] leading-tight"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zamknij"
              className="p-2 -m-2 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </header>
        )}
        <div>{children}</div>
        {footer && <footer className="mt-6 flex gap-3 justify-end">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

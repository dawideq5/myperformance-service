"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DialogSize = "md" | "lg" | "xl";

const SIZE: Record<DialogSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "relative w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-card animate-slide-up",
          SIZE[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-lg font-semibold text-slate-100 truncate">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-sm text-slate-400 mt-1">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-subtle)] bg-black/20 rounded-b-2xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

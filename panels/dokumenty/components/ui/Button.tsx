"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "mp-gradient-btn text-white hover:brightness-110 active:brightness-95 disabled:opacity-40",
  secondary:
    "bg-slate-800/70 text-slate-100 hover:bg-slate-700/70 border border-slate-700/60 hover:border-brand-500/40 disabled:opacity-40",
  ghost:
    "bg-transparent text-slate-200 hover:bg-slate-800/70 disabled:opacity-40",
  danger:
    "bg-red-600/90 text-white hover:bg-red-600 shadow-[0_10px_24px_rgba(239,68,68,0.28)] disabled:opacity-40",
  success:
    "bg-emerald-600/90 text-white hover:bg-emerald-600 shadow-[0_10px_24px_rgba(16,185,129,0.28)] disabled:opacity-40",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", loading, leftIcon, rightIcon, className, children, disabled, ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-main)] active:translate-y-px",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  ),
);
Button.displayName = "Button";

"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "link";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:bg-[var(--accent)]/50 shadow-sm",
  secondary:
    "border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-main)] hover:bg-[var(--bg-main)]",
  ghost:
    "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]",
  danger:
    "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-500/50",
  success:
    "bg-green-500 text-white hover:bg-green-600 disabled:bg-green-500/50",
  link:
    "text-[var(--accent)] hover:underline underline-offset-4 p-0 h-auto",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  icon: "h-10 w-10 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-main)]",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "active:scale-[0.98]",
        variantStyles[variant],
        variant !== "link" && sizeStyles[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

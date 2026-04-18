import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-subtle)]",
  accent: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
  success: "bg-green-500/10 text-green-500 border-green-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  danger: "bg-red-500/10 text-red-500 border-red-500/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border",
        toneStyles[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

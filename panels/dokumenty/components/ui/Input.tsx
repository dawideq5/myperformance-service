"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, ...rest }, ref) => {
    const base =
      "w-full h-10 rounded-xl bg-[var(--bg-input)] border border-slate-700/60 hover:border-brand-500/30 transition-colors text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/60 disabled:opacity-60";
    if (!leftIcon)
      return <input ref={ref} {...rest} className={cn(base, "px-3", className)} />;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {leftIcon}
        </span>
        <input ref={ref} {...rest} className={cn(base, "pl-9 pr-3", className)} />
      </div>
    );
  },
);
Input.displayName = "Input";

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cn(
        "w-full rounded-xl bg-[var(--bg-input)] border border-slate-700/60 hover:border-brand-500/30 transition-colors px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/60 disabled:opacity-60",
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "w-full h-10 rounded-xl bg-[var(--bg-input)] border border-slate-700/60 hover:border-brand-500/30 transition-colors px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/60 disabled:opacity-60",
        className,
      )}
    >
      {children}
    </select>
  );
}

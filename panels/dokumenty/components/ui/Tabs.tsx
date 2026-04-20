"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  active: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap gap-1 p-1 rounded-xl border border-slate-700/60 bg-slate-900/60",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-600 text-white shadow"
                : "text-slate-300 hover:bg-slate-800 hover:text-slate-100",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full border",
                  isActive
                    ? "bg-white/20 border-white/30 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

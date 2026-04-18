"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabDefinition<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  hidden?: boolean;
}

interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabDefinition<T>>;
  activeTab: T;
  onChange: (id: T) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
  ariaLabel?: string;
}

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  orientation = "vertical",
  className,
  ariaLabel = "Sekcje",
}: TabsProps<T>) {
  const visibleTabs = tabs.filter((t) => !t.hidden);

  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex gap-1 overflow-x-auto -mx-2 px-2 pb-1 scrollbar-thin",
        className,
      )}
    >
      {visibleTabs.map(({ id, label, icon, badge }) => {
        const active = id === activeTab;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`tabpanel-${id}`}
            id={`tab-${id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-3 text-sm font-medium rounded-xl transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
              orientation === "vertical"
                ? "w-full px-4 py-3 justify-start"
                : "px-3 py-2",
              active
                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)]",
            )}
          >
            {icon}
            <span>{label}</span>
            {badge && (
              <span className={orientation === "vertical" ? "ml-auto" : "ml-1"}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

interface TabPanelProps {
  tabId: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ tabId, active, children, className }: TabPanelProps) {
  if (!active) return null;
  return (
    <section
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={cn("animate-tab-in focus:outline-none", className)}
    >
      {children}
    </section>
  );
}

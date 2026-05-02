"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pojedynczy kafelek konfiguracji (`/admin/config`). Wszystkie kafelki w
 * hubie używają tego samego komponentu — identyczny padding, border-radius,
 * hover, layout. Akcent (kolor) różni się tylko per-tile (tło ikonki).
 */

export type ConfigTileAccent =
  | "violet"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo"
  | "pink"
  | "teal"
  | "blue";

interface ConfigTileProps {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  accent?: ConfigTileAccent;
}

const ACCENT_CLASSES: Record<ConfigTileAccent, string> = {
  violet: "bg-violet-500/10 text-violet-400",
  sky: "bg-sky-500/10 text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  amber: "bg-amber-500/10 text-amber-400",
  rose: "bg-rose-500/10 text-rose-400",
  indigo: "bg-indigo-500/10 text-indigo-400",
  pink: "bg-pink-500/10 text-pink-400",
  teal: "bg-teal-500/10 text-teal-400",
  blue: "bg-blue-500/10 text-blue-400",
};

export function ConfigTile({
  icon,
  title,
  description,
  href,
  accent = "violet",
}: ConfigTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 transition-all",
        "hover:border-[var(--accent)]/40 hover:shadow-lg hover:-translate-y-0.5",
      )}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
          ACCENT_CLASSES[accent],
        )}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--text-main)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
    </Link>
  );
}

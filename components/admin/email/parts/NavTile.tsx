"use client";

import { ChevronRight } from "lucide-react";

import { Card } from "@/components/ui";

export function NavTile({
  icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card padding="md">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="p-2 rounded-lg bg-[var(--bg-main)] flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)]">
            {cta} <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </button>
    </Card>
  );
}

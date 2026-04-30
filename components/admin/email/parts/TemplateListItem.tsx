"use client";

import { ChevronRight, Power } from "lucide-react";

import { Badge } from "@/components/ui";

import type { TemplateRow } from "../types";

export function TemplateListItem({
  template,
  onClick,
}: {
  template: TemplateRow;
  onClick: () => void;
}) {
  const editabilityBadge = () => {
    switch (template.editability) {
      case "full":
        return <Badge tone="success">edytowalne</Badge>;
      case "kc-localization":
        return <Badge tone="warning">KC localization</Badge>;
      case "external-link":
        return <Badge tone="neutral">w aplikacji</Badge>;
      case "readonly":
        return <Badge tone="danger">brak edycji</Badge>;
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        {!template.enabled && (
          <span title="Wyłączone — nie wysyła">
            <Power className="w-4 h-4 text-red-400" />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text-main)] truncate">
            {template.name}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] truncate">
            {template.appLabel}
            {template.hasOverride ? " · zmodyfikowany" : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {editabilityBadge()}
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
    </button>
  );
}

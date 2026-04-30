"use client";

import { ExternalLink, Lock, X } from "lucide-react";

import { Alert, Button, Card } from "@/components/ui";

import type { TemplateRow } from "../types";

export function NonEditableView({
  template,
  onClose,
  message,
  externalUrl,
  externalLabel,
}: {
  template: TemplateRow;
  onClose: () => void;
  message: string;
  externalUrl?: string;
  externalLabel?: string;
}) {
  return (
    <Card padding="lg">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<X className="w-4 h-4" />}
        onClick={onClose}
      >
        Wróć do listy
      </Button>
      <div className="mt-4 flex items-start gap-4">
        <div className="p-3 rounded-lg bg-amber-500/10 flex-shrink-0">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            {template.name}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            <strong>{template.appLabel}</strong> · {template.description}
          </p>
          <Alert tone="warning" className="mt-4">
            {message}
          </Alert>
          {externalUrl && externalLabel && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
            >
              {externalLabel} <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <div className="mt-6 text-xs text-[var(--text-muted)]">
            <strong>Kiedy się wysyła:</strong> {template.trigger}
          </div>
        </div>
      </div>
    </Card>
  );
}

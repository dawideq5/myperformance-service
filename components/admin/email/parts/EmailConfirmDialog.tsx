"use client";

import { Button, Card } from "@/components/ui";

/**
 * Lightweight confirmation modal used by the email panel — purposely keeps the
 * exact look-and-feel of the original inline `ConfirmDialog` from the
 * monolithic EmailClient (different from the shared `ui/ConfirmDialog`).
 */
export function EmailConfirmDialog({
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel,
  confirmVariant,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="lg" className="w-full max-w-md">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Anuluj
          </Button>
          <Button
            onClick={onConfirm}
            className={
              confirmVariant === "danger"
                ? "bg-red-500/90 hover:bg-red-500 border-red-600"
                : ""
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export type ConfirmTone = "info" | "warning" | "danger";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Async lub sync action wywoływane po klik confirm. Dialog pozostaje
   * otwarty z busy spinnerem aż obietnica się rozstrzygnie. */
  onConfirm: () => void | Promise<void>;
  title: string;
  /** Główny opis akcji — JEDNO zdanie co się stanie. */
  description?: ReactNode;
  /** Lista konsekwencji w punktach — szczegóły co dokładnie się zmieni. */
  consequences?: ReactNode[];
  /** Dodatkowe pole input (np. powód blokady) renderowane przed actions. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

const TONE_STYLES: Record<
  ConfirmTone,
  {
    icon: ReactNode;
    iconBg: string;
    confirmClass: string;
  }
> = {
  info: {
    icon: <Info className="w-5 h-5 text-blue-400" />,
    iconBg: "bg-blue-500/10",
    confirmClass: "",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    iconBg: "bg-amber-500/10",
    confirmClass: "",
  },
  danger: {
    icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
    iconBg: "bg-red-500/10",
    confirmClass: "!bg-red-600 hover:!bg-red-700",
  },
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  consequences,
  body,
  confirmLabel = "Potwierdzam",
  cancelLabel = "Anuluj",
  tone = "warning",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const t = TONE_STYLES[tone];

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.iconBg}`}
          >
            {t.icon}
          </div>
          <span>{title}</span>
        </div>
      }
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            loading={busy}
            className={t.confirmClass}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {description && (
          <p className="text-[var(--text-main)]">{description}</p>
        )}
        {consequences && consequences.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Co się stanie
            </div>
            <ul className="text-xs space-y-1 list-disc list-inside text-[var(--text-muted)]">
              {consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {body && <div className="pt-2">{body}</div>}
      </div>
    </Dialog>
  );
}

// ── Hook helper ──────────────────────────────────────────────────────────
//
// useConfirm() zwraca `confirm` funkcję która otwiera dialog i czeka aż user
// kliknie potwierdź/anuluj. Pozwala uniknąć useState w każdym callsite.
//
// Użycie:
//   const { confirm, ConfirmDialogElement } = useConfirm();
//   ...
//   const ok = await confirm({ title: "...", description: "..." });
//   if (ok) await doIt();
//   ...
//   return <>{ConfirmDialogElement}</>;

import { useCallback, useRef, useState as useStateBase } from "react";

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  consequences?: ReactNode[];
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export function useConfirm() {
  const [opts, setOpts] = useStateBase<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const close = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setOpts(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setOpts(null);
  }, []);

  const ConfirmDialogElement = opts ? (
    <ConfirmDialog
      open={true}
      onClose={close}
      onConfirm={handleConfirm}
      title={opts.title}
      description={opts.description}
      consequences={opts.consequences}
      body={opts.body}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      tone={opts.tone}
    />
  ) : null;

  return { confirm, ConfirmDialogElement };
}

"use client";

/**
 * Wave 21 / Faza 1G — modal trwałego usuwania zlecenia.
 *
 * Wymagania UX:
 *   - Header: "Trwałe usunięcie zlecenia #<ticket>"
 *   - Warning (kolory destructive)
 *   - Licznik powiązanych elementów (X zdjęć, Y aneksów, Z komponentów,
 *     N notatek, M dokumentów) — fetch przed renderem
 *   - Pole tekstowe + przycisk "Kopiuj" do clipboard z exact phrase
 *   - Walidacja: input.trim().toLowerCase() === target.trim().toLowerCase()
 *   - Submit: DELETE /api/relay/services/<id>/full z { confirmText }
 *   - Po sukcesie: redirect (przez `onDeleted` callback) + banner
 *   - A11y: role=dialog, aria-modal, focus trap, ESC zamyka, focus na input.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, Loader2, X } from "lucide-react";

interface RelatedCounts {
  photos: number;
  components: number;
  annexes: number;
  internalNotes: number;
  documents: number;
  partOrders: number;
}

interface DeleteServiceModalProps {
  open: boolean;
  serviceId: string;
  ticketNumber: string | null;
  onClose: () => void;
  /** Callback po udanym usunięciu — parent powinien zrobić redirect do listy. */
  onDeleted: (deletedCounts: Record<string, number>) => void;
}

export function DeleteServiceModal({
  open,
  serviceId,
  ticketNumber,
  onClose,
  onDeleted,
}: DeleteServiceModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<RelatedCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const expectedPhrase = useMemo(
    () => `usuń zlecenie #${ticketNumber ?? ""}`,
    [ticketNumber],
  );
  const matched = useMemo(
    () =>
      confirmText.trim().toLowerCase() === expectedPhrase.trim().toLowerCase(),
    [confirmText, expectedPhrase],
  );

  // Reset state na re-open.
  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setError(null);
    setCopied(false);
    // Auto-focus po renderze.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Counts fetch — best-effort, błąd pokazuje "—" zamiast crashu.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCountsLoading(true);
    const fetchCount = async (path: string): Promise<number> => {
      try {
        const r = await fetch(
          `/api/relay/services/${encodeURIComponent(serviceId)}/${path}`,
        );
        if (!r.ok) return 0;
        const j = (await r.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!j) return 0;
        // Endpoints zwracają różne klucze — heurystyka.
        for (const key of [
          "photos",
          "components",
          "annexes",
          "notes",
          "documents",
          "orders",
          "partOrders",
          "items",
        ]) {
          const v = (j as Record<string, unknown>)[key];
          if (Array.isArray(v)) return v.length;
        }
        return 0;
      } catch {
        return 0;
      }
    };
    Promise.all([
      fetchCount("photos"),
      fetchCount("components"),
      fetchCount("annexes"),
      fetchCount("internal-notes"),
      fetchCount("documents"),
      fetchCount("part-orders"),
    ])
      .then(([photos, components, annexes, internalNotes, documents, partOrders]) => {
        if (cancelled) return;
        setCounts({
          photos,
          components,
          annexes,
          internalNotes,
          documents,
          partOrders,
        });
      })
      .finally(() => {
        if (!cancelled) setCountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, serviceId]);

  // ESC closes (gdy nie submitting).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const copyPhrase = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(expectedPhrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard API może być zablokowane (insecure context). Fallback —
      // selectAll na inputcie z phrase. Pomijamy bo input jest read-only.
    }
  }, [expectedPhrase]);

  const handleSubmit = useCallback(async () => {
    if (!matched || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/full`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmText: expectedPhrase }),
        },
      );
      const j = (await r.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            deletedCounts?: Record<string, number>;
          }
        | null;
      if (!r.ok || !j?.ok) {
        throw new Error(
          j?.message ?? j?.error ?? `Błąd serwera (HTTP ${r.status})`,
        );
      }
      onDeleted(j.deletedCounts ?? {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Nie udało się usunąć zlecenia",
      );
      setSubmitting(false);
    }
  }, [matched, submitting, serviceId, expectedPhrase, onDeleted]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-service-title"
      aria-describedby="delete-service-desc"
      className="fixed inset-0 z-[2100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-card)",
          borderColor: "rgba(239, 68, 68, 0.4)",
        }}
      >
        <div
          className="px-5 py-4 border-b flex items-start justify-between gap-2"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: "#ef4444" }}
              aria-hidden="true"
            />
            <h2
              id="delete-service-title"
              className="text-base font-semibold truncate"
              style={{ color: "var(--text-main)" }}
            >
              Trwałe usunięcie zlecenia #{ticketNumber ?? ""}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-1.5 rounded-lg disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p
            id="delete-service-desc"
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-main)" }}
          >
            Usunięcie jest <strong>nieodwracalne</strong>. Wszystkie zdjęcia,
            aneksy, komponenty, notatki, historia wycen, dokumenty i wpisy
            audytu zostaną trwale usunięte. Powiązane PDF-y w Documenso
            zostaną wycofane.
          </p>

          <div
            className="rounded-lg border p-3 text-xs space-y-1"
            style={{
              borderColor: "var(--border-subtle)",
              background: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold">
              Powiązane elementy
            </p>
            {countsLoading ? (
              <p className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Liczenie…
              </p>
            ) : counts ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <li>{counts.photos} zdjęć</li>
                <li>{counts.annexes} aneksów</li>
                <li>{counts.components} komponentów</li>
                <li>{counts.internalNotes} notatek</li>
                <li>{counts.documents} dokumentów</li>
                <li>{counts.partOrders} zamówień części</li>
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="delete-confirm-input"
              className="text-xs font-medium"
              style={{ color: "var(--text-main)" }}
            >
              Aby potwierdzić, wpisz dokładnie:
            </label>
            <div className="flex items-center gap-2">
              <code
                onClick={copyPhrase}
                className="flex-1 px-2 py-1.5 rounded-md font-mono text-xs cursor-pointer truncate"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  color: "#fca5a5",
                  borderColor: "rgba(239, 68, 68, 0.3)",
                  border: "1px solid",
                }}
                title="Kliknij aby skopiować"
              >
                {expectedPhrase}
              </code>
              <button
                type="button"
                onClick={copyPhrase}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 flex-shrink-0"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                  background: "var(--bg-surface)",
                }}
                aria-label="Skopiuj frazę potwierdzenia"
              >
                <Copy className="w-3 h-3" aria-hidden="true" />
                {copied ? "Skopiowano" : "Kopiuj"}
              </button>
            </div>
            <input
              ref={inputRef}
              id="delete-confirm-input"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedPhrase}
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              className="w-full px-2.5 py-1.5 rounded-lg border text-sm outline-none font-mono"
              style={{
                background: "var(--bg-surface)",
                borderColor: matched
                  ? "rgba(34, 197, 94, 0.5)"
                  : "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              aria-invalid={!matched && confirmText.length > 0}
              aria-describedby="delete-confirm-help"
            />
            <p
              id="delete-confirm-help"
              className="text-[11px]"
              style={{
                color: matched
                  ? "#22c55e"
                  : confirmText.length > 0
                    ? "#ef4444"
                    : "var(--text-muted)",
              }}
            >
              {matched
                ? "Potwierdzenie poprawne — możesz usunąć."
                : confirmText.length > 0
                  ? "Tekst nie pasuje. Wpisz dokładnie frazę powyżej."
                  : "Brak rozróżniania wielkości liter."}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border p-2 text-xs"
              style={{
                borderColor: "rgba(239, 68, 68, 0.4)",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="px-5 py-3 border-t flex items-center justify-end gap-2"
          style={{
            borderColor: "var(--border-subtle)",
            background: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
              background: "var(--bg-card)",
            }}
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!matched || submitting}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: matched ? "#dc2626" : "rgba(120,120,120,0.5)",
              color: "#fff",
            }}
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Usuń trwale
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
import type { ServiceTicket } from "../tabs/ServicesBoard";
import type { ServiceStatus } from "@/lib/serwisant/status-meta";
import { StatusBadge } from "../StatusBadge";
import { PhotoGallery } from "../features/PhotoGallery";

interface ServiceAction {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface NaprawaTabProps {
  service: ServiceTicket;
  onRequestStatusChange: (target: ServiceStatus) => void;
}

export function NaprawaTab({
  service,
  onRequestStatusChange,
}: NaprawaTabProps) {
  const [actions, setActions] = useState<ServiceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/relay/services/${service.id}/actions`)
      .then((r) => r.json())
      .then((j: { actions?: ServiceAction[] }) => {
        if (!cancelled) setActions(j?.actions ?? []);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service.id]);

  const repairActions = actions.filter((a) => a.action.startsWith("repair_"));

  const submitNote = async () => {
    if (!note.trim()) return;
    setSubmittingNote(true);
    setNoteError(null);
    // TODO: dedykowany endpoint /api/panel/services/[id]/note nie istnieje.
    // Tymczasowo zostawiamy NIE-zapisany input w UI; po implementacji
    // endpointu (Phase 3 backend) podpinamy POST tutaj.
    setNoteError("Endpoint dla notatek serwisowych nie jest jeszcze dostępny.");
    setSubmittingNote(false);
  };

  const status = service.status as ServiceStatus;

  return (
    <div className="space-y-4">
      <Section title="Status naprawy">
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status={status} size="md" />
          {service.holdReason && status === "on_hold" && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Powód: {service.holdReason}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== "on_hold" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("on_hold")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Wstrzymaj
            </button>
          )}
          {status === "on_hold" && service.previousStatus && (
            <button
              type="button"
              onClick={() =>
                onRequestStatusChange(
                  (service.previousStatus ?? "diagnosing") as ServiceStatus,
                )
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Wznów
            </button>
          )}
          {(status === "repairing" || status === "awaiting_parts") && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("testing")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Wyślij na testy
            </button>
          )}
          {status === "awaiting_parts" && (
            <button
              type="button"
              onClick={() => onRequestStatusChange("repairing")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Wznów naprawę
            </button>
          )}
        </div>
      </Section>

      <Section title="Czynności naprawcze">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
        ) : repairActions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Brak zarejestrowanych czynności naprawczych.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {repairActions.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 p-2 rounded-lg"
                style={{ background: "var(--bg-surface)" }}
              >
                <Wrench
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: "var(--text-main)" }}>
                    {a.summary || a.action}
                  </p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {a.actorName ?? a.actorEmail ?? "—"} ·{" "}
                    {new Date(a.createdAt).toLocaleString("pl-PL")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Zdjęcia z naprawy">
        <PhotoGallery serviceId={service.id} stage="in_repair" />
      </Section>

      <Section title="Notatka serwisowa">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
          placeholder="Notatka techniczna do logu zlecenia…"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitNote()}
            disabled={submittingNote || !note.trim()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {submittingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Dodaj wpis
          </button>
          {noteError && (
            <span className="text-[11px]" style={{ color: "#ef4444" }}>
              {noteError}
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <h3
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

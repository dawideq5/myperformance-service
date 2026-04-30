"use client";

import { Activity, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import {
  BINDING_FIELD_LABELS,
  EVENT_LABELS,
  eventTone,
  type BindingEventRow,
  type DeviceBinding,
} from "@/lib/services/certificates-service";

export function BindingDetails({
  binding,
  events,
  loading,
  error,
  resetting,
  onReset,
}: {
  binding: DeviceBinding | null;
  events: BindingEventRow[];
  loading: boolean;
  error: string | null;
  resetting: boolean;
  onReset: () => void;
}) {
  if (loading && !binding) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Ładowanie powiązania urządzenia…
      </p>
    );
  }
  if (error) return <Alert tone="error">{error}</Alert>;

  const denialEvents = events.filter((e) => e.kind === "denied");

  return (
    <div className="space-y-4">
      {binding ? (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/60 p-4">
          <header className="flex items-center gap-2 text-sm text-[var(--text-main)] mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="font-medium">Powiązane urządzenie</span>
            <Badge tone={binding.lastDeniedAt ? "danger" : "success"}>
              {binding.lastDeniedAt
                ? "wykryto nieautoryzowany dostęp"
                : "stabilne"}
            </Badge>
          </header>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <BindingField
              label="Pierwsze użycie"
              value={new Date(binding.firstSeenAt).toLocaleString("pl-PL")}
            />
            <BindingField
              label="Ostatnie użycie"
              value={new Date(binding.lastSeenAt).toLocaleString("pl-PL")}
            />
            {Object.entries(binding.components).map(([k, v]) => (
              <BindingField
                key={k}
                label={BINDING_FIELD_LABELS[k] ?? k}
                value={v || "—"}
                truncate
              />
            ))}
          </dl>
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
              loading={resetting}
              onClick={onReset}
            >
              Zresetuj powiązanie
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/60 p-4">
          <p className="text-xs text-[var(--text-muted)]">
            Brak powiązanego urządzenia. Certyfikat jeszcze nie został użyty —
            pierwsze poprawne użycie utworzy odcisk urządzenia. Status
            zaktualizuje się automatycznie, gdy to nastąpi.
          </p>
        </section>
      )}

      {denialEvents.length > 0 && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <header className="flex items-center gap-2 text-sm text-red-200 mb-3">
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">
              Nieautoryzowany dostęp z innego urządzenia
            </span>
            <Badge tone="danger">{denialEvents.length}</Badge>
          </header>
          <ul className="space-y-2">
            {denialEvents.slice(0, 10).map((ev) => (
              <li
                key={ev.id}
                className="text-xs border-l border-red-500/40 pl-3 py-1"
              >
                <p className="text-red-200 font-mono">
                  {new Date(ev.ts).toLocaleString("pl-PL")}
                  {ev.ip ? ` • ${ev.ip}` : ""}
                </p>
                {ev.diff && ev.diff.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {ev.diff.map((d) => (
                      <li key={d.field} className="text-[var(--text-muted)]">
                        <span className="text-[var(--text-main)]">
                          {BINDING_FIELD_LABELS[d.field] ?? d.field}:
                        </span>{" "}
                        <span className="text-red-300">„{d.after}&rdquo;</span>{" "}
                        zamiast{" "}
                        <span className="text-emerald-300">„{d.before}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {denialEvents.length > 10 && (
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Pokazano 10 najnowszych z {denialEvents.length}.
            </p>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/40 p-4">
          <header className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-3">
            <Activity className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">Oś czasu zdarzeń</span>
            <Badge tone="neutral">{events.length}</Badge>
          </header>
          <ul className="space-y-1.5 text-xs">
            {events.slice(0, 20).map((ev) => (
              <li
                key={ev.id}
                className="flex items-start gap-2 text-[var(--text-muted)]"
              >
                <Badge tone={eventTone(ev.kind)}>
                  {EVENT_LABELS[ev.kind]}
                </Badge>
                <span className="font-mono whitespace-nowrap">
                  {new Date(ev.ts).toLocaleString("pl-PL")}
                </span>
                {ev.ip && <span>• {ev.ip}</span>}
                {ev.actor && <span>• {ev.actor}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BindingField({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd
        className={`text-[var(--text-main)] ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

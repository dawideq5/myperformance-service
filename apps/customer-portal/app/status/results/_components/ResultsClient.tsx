"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface ServiceItem {
  id: string;
  ticketNumber: string;
  status: string;
  statusLabel: string;
  brand: string | null;
  model: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const STATUS_TONES: Record<string, { fg: string; bg: string }> = {
  received: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
  diagnosing: { fg: "var(--info)", bg: "var(--info-bg)" },
  awaiting_quote: { fg: "var(--warning)", bg: "var(--warning-bg)" },
  awaiting_parts: { fg: "var(--warning)", bg: "var(--warning-bg)" },
  repairing: { fg: "var(--info)", bg: "var(--info-bg)" },
  testing: { fg: "var(--info)", bg: "var(--info-bg)" },
  ready: { fg: "var(--success)", bg: "var(--success-bg)" },
  delivered: { fg: "var(--success)", bg: "var(--success-bg)" },
  on_hold: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
  rejected_by_customer: { fg: "var(--danger)", bg: "var(--danger-bg)" },
  returned_no_repair: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
  closed: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
  cancelled: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
  archived: { fg: "var(--neutral)", bg: "var(--neutral-bg)" },
};

function StatusChip({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONES[status] ?? STATUS_TONES.received;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ color: tone.fg, background: tone.bg }}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ResultsClient() {
  const [items, setItems] = useState<ServiceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: ServiceItem[]; total: number }>("/services").then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sesja wygasła — wpisz ponownie email i kod.");
        } else {
          setError("Nie udało się pobrać zleceń.");
        }
        setItems([]);
        return;
      }
      setItems(res.data?.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="h-6 w-40 rounded animate-pulse bg-bg-muted" />
        <div className="h-28 rounded-2xl animate-pulse bg-bg-muted" />
        <div className="h-28 rounded-2xl animate-pulse bg-bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border p-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-xl font-semibold mb-2">Błąd</h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          {error}
        </p>
        <Link
          href="/status"
          className="inline-flex rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Wróć i wpisz email
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-xl font-semibold mb-2">
          Nie znaleźliśmy zleceń
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Sprawdź pisownię adresu email albo skontaktuj się z punktem.
        </p>
        <Link href="/status" className="text-sm underline">
          Spróbuj inny email
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Twoje zlecenia
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        Znaleźliśmy {items.length}{" "}
        {items.length === 1 ? "zlecenie" : items.length < 5 ? "zlecenia" : "zleceń"}{" "}
        powiązanych z tym adresem.
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <article
              className="rounded-2xl border p-5 hover:bg-bg-muted/30 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-mono text-sm" style={{ color: "var(--text-light)" }}>
                    {item.ticketNumber}
                  </div>
                  <h2 className="font-display text-lg font-semibold">
                    {[item.brand, item.model].filter(Boolean).join(" ") || "Urządzenie"}
                  </h2>
                </div>
                <StatusChip status={item.status} label={item.statusLabel} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt style={{ color: "var(--text-muted)" }}>Przyjęte</dt>
                <dd>{formatDate(item.createdAt)}</dd>
                <dt style={{ color: "var(--text-muted)" }}>Aktualizacja</dt>
                <dd>{formatDate(item.updatedAt)}</dd>
                {item.amountEstimate != null ? (
                  <>
                    <dt style={{ color: "var(--text-muted)" }}>Wycena</dt>
                    <dd>{item.amountEstimate.toFixed(2)} zł</dd>
                  </>
                ) : null}
              </dl>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

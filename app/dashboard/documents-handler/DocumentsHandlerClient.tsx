"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSignature,
  PlusCircle,
  Search,
  X,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  OnboardingCard,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type {
  DocumensoDocument,
  DocumensoDocumentStats,
} from "@/lib/documenso";

interface Props {
  documents: DocumensoDocument[];
  stats: DocumensoDocumentStats;
  documensoBaseUrl: string;
  userLabel?: string;
  userEmail?: string;
}

type StatusFilter = "all" | "pending" | "completed" | "declined" | "expired";

const STATUS_TONES: Record<
  string,
  "neutral" | "success" | "danger" | "warning" | "info"
> = {
  completed: "success",
  declined: "danger",
  expired: "warning",
  draft: "neutral",
  pending: "info",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Podpisany",
  declined: "Odrzucony",
  expired: "Wygasł",
  draft: "Szkic",
  pending: "W obiegu",
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function DocumentsHandlerClient({
  documents,
  stats,
  documensoBaseUrl,
  userLabel,
  userEmail,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (filter !== "all" && d.status !== filter) return false;
      if (!q) return true;
      if (d.name.toLowerCase().includes(q)) return true;
      return d.recipients.some(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q),
      );
    });
  }, [documents, query, filter]);

  const newDocumentUrl = `${documensoBaseUrl.replace(/\/$/, "")}/documents`;

  return (
    <PageShell
      maxWidth="xl"
      header={
        <AppHeader
          backHref="/dashboard"
          title="Obsługa dokumentów"
          userLabel={userLabel}
          userSubLabel={userEmail}
        />
      }
    >
      <OnboardingCard
        storageKey="docs-handler"
        title="Obieg dokumentów organizacji"
        requiresArea="documenso"
        requiresMinPriority={50}
      >
        Widok zawiera wszystkie dokumenty Twojej organizacji — niezależnie czy
        wysłałeś je Ty, czy ktoś z zespołu. Klik w dokument otwiera Documenso z
        auto-loginem (SSO). Powiadomienia o podpisach trafiają do dzwonka i
        emaila zgodnie z Preferencjami.
      </OnboardingCard>

      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-[var(--text-muted)] max-w-2xl">
          Widok wszystkich dokumentów w obiegu całej organizacji. Możesz
          monitorować status, sprawdzać kto już podpisał i wysyłać nowe
          dokumenty do podpisu. Pełna konsola administracyjna Documenso
          pozostaje zastrzeżona dla administratorów.
        </p>
        <div className="flex gap-2">
          <Button
            leftIcon={<PlusCircle className="w-4 h-4" aria-hidden="true" />}
            onClick={() => {
              window.open(newDocumentUrl, "_blank", "noopener,noreferrer");
            }}
          >
            Nowy dokument
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatTile label="Wszystkie" value={stats.total} tone="neutral" />
        <StatTile label="W obiegu" value={stats.pending} tone="info" />
        <StatTile label="Podpisane" value={stats.completed} tone="success" />
        <StatTile label="Odrzucone" value={stats.declined} tone="danger" />
        <StatTile label="Wygasłe" value={stats.expired} tone="warning" />
      </section>

      <Card padding="lg">
        <CardHeader
          icon={<FileSignature className="w-6 h-6 text-[var(--accent)]" />}
          title="Dokumenty"
          description="Pełna lista z widoku administracyjnego Documenso."
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px] relative">
            <Input
              leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
              placeholder="Szukaj po nazwie dokumentu, e-mailu lub odbiorcy…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Wyczyść"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all", label: "Wszystkie" },
                { id: "pending", label: "W obiegu" },
                { id: "completed", label: "Podpisane" },
                { id: "declined", label: "Odrzucone" },
                { id: "expired", label: "Wygasłe" },
              ] as { id: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === f.id
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              {documents.length === 0
                ? "Brak dokumentów w obiegu."
                : "Brak dokumentów pasujących do filtrów."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="py-3 px-3 font-medium">Dokument</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-3 font-medium">Odbiorcy</th>
                  <th className="py-3 px-3 font-medium">Utworzono</th>
                  <th className="py-3 px-3 font-medium">Zakończono</th>
                  <th className="py-3 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const docUrl = `${documensoBaseUrl.replace(/\/$/, "")}/documents/${d.id}`;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-main)]/50"
                    >
                      <td className="py-3 px-3 text-[var(--text-main)]">
                        {d.name}
                      </td>
                      <td className="py-3 px-3">
                        <Badge tone={STATUS_TONES[d.status] ?? "neutral"}>
                          {STATUS_LABELS[d.status] ?? d.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-xs text-[var(--text-muted)]">
                        <RecipientSummary recipients={d.recipients} />
                      </td>
                      <td className="py-3 px-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDate(d.createdAt)}
                      </td>
                      <td className="py-3 px-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {d.completedAt ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            {formatDate(d.completedAt)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                        >
                          Otwórz{" "}
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </PageShell>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "danger" | "warning" | "info";
}) {
  const toneClass = {
    neutral: "text-[var(--text-main)]",
    success: "text-emerald-400",
    danger: "text-red-400",
    warning: "text-amber-400",
    info: "text-sky-400",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function RecipientSummary({
  recipients,
}: {
  recipients: DocumensoDocument["recipients"];
}) {
  if (recipients.length === 0) return <span>—</span>;
  const signed = recipients.filter((r) => r.status === "completed").length;
  return (
    <div>
      <span className="text-[var(--text-main)]">
        {signed}/{recipients.length} podpisało
      </span>
      <span className="block text-[11px] truncate max-w-[220px]">
        {recipients.map((r) => r.email).join(", ")}
      </span>
    </div>
  );
}

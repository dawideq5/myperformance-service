"use client";

/**
 * Wave 22 / F8 — biblioteka dokumentów per zlecenie (panel sprzedawcy).
 *
 * Mirror panelu serwisanta (`panels/serwisant/components/detail/DocumentsLibraryTab.tsx`)
 * — sprzedawca i serwisant widzą IDENTYCZNĄ listę dokumentów (location-based
 * filter na backendzie, brak filtrowania per rola).
 *
 * Lista dokumentów (z `/api/relay/services/[id]/documents`) z akcjami:
 *  - "Pobierz oryginał"   → ?version=original
 *  - "Pobierz podpisany"  → ?version=signed
 *
 * Real-time SSE hook (`subscribeToService`) re-fetchuje listę gdy backend
 * publikuje document_created/updated/deleted.
 *
 * NB: extract do shared `lib/components/` jest zablokowany przez panel-local
 * tsconfig paths (`@/*` resolvuje per-panel). Duplikacja komponenty jest
 * świadoma i pilnowana przez ten komentarz: zmiany w jednym pliku ZAWSZE
 * propagujemy do drugiego (serwisant ↔ sprzedawca). Follow-up: extract do
 * monorepo-shared package gdy będzie sensowne.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Download,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { subscribeToService } from "@/lib/sse-client";

export type ServiceDocumentKind =
  | "receipt"
  | "annex"
  | "handover"
  | "release_code"
  | "warranty"
  | "other";

export type ServiceDocumentStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "signed"
  | "rejected"
  | "expired";

interface ServiceDocumentRow {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  kind: ServiceDocumentKind;
  title: string | null;
  originalPdfFileId: string | null;
  signedPdfFileId: string | null;
  documensoDocId: number | null;
  documensoSigningUrl: string | null;
  status: ServiceDocumentStatus;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface DocumentsLibraryPanelProps {
  serviceId: string;
}

const KIND_LABEL: Record<ServiceDocumentKind, string> = {
  receipt: "Potwierdzenie przyjęcia",
  annex: "Aneks",
  handover: "Protokół wydania",
  release_code: "Kod wydania",
  warranty: "Karta gwarancyjna",
  other: "Dokument",
};

const STATUS_META: Record<
  ServiceDocumentStatus,
  { label: string; bg: string; fg: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  draft: {
    label: "Szkic",
    bg: "rgba(148, 163, 184, 0.18)",
    fg: "#475569",
    Icon: AlertCircle,
  },
  sent: {
    label: "Wysłany do podpisu",
    bg: "rgba(59, 130, 246, 0.16)",
    fg: "#1d4ed8",
    Icon: Clock,
  },
  partially_signed: {
    label: "Częściowo podpisany",
    bg: "rgba(234, 179, 8, 0.18)",
    fg: "#a16207",
    Icon: Clock,
  },
  signed: {
    label: "Podpisany",
    bg: "rgba(34, 197, 94, 0.18)",
    fg: "#15803d",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Odrzucony",
    bg: "rgba(239, 68, 68, 0.18)",
    fg: "#b91c1c",
    Icon: XCircle,
  },
  expired: {
    label: "Wygasł",
    bg: "rgba(148, 163, 184, 0.18)",
    fg: "#475569",
    Icon: AlertCircle,
  },
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "przed chwilą";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} godz. temu`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d. temu`;
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function downloadHref(serviceId: string, docId: string, version: "signed" | "original"): string {
  return `/api/relay/services/${serviceId}/documents/${docId}/download?version=${version}`;
}

export function DocumentsLibraryPanel({ serviceId }: DocumentsLibraryPanelProps) {
  const [documents, setDocuments] = useState<ServiceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/relay/services/${serviceId}/documents`);
      const j = (await r.json().catch(() => null)) as
        | { documents?: ServiceDocumentRow[]; error?: string }
        | null;
      if (!r.ok) {
        setError(j?.error ?? `HTTP ${r.status}`);
        setDocuments([]);
      } else {
        setDocuments(j?.documents ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Real-time bus — re-fetch lista gdy backend publish'uje document_*.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (
        evt.type === "document_created" ||
        evt.type === "document_updated" ||
        evt.type === "document_deleted"
      ) {
        void fetchList();
      }
    });
    return unsub;
  }, [serviceId, fetchList]);

  if (loading && documents.length === 0) {
    return (
      <div
        className="flex justify-center py-8"
        role="status"
        aria-label="Ładowanie listy dokumentów"
      >
        <Loader2
          className="w-5 h-5 animate-spin"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-3 rounded-xl border text-sm"
        style={{ borderColor: "#ef4444", color: "#ef4444" }}
        role="alert"
      >
        Nie udało się pobrać listy dokumentów: {error}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div
        className="p-3 rounded-xl border text-center text-sm"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Brak dokumentów w bibliotece zlecenia. Pierwszy dokument pojawi się tu po
        wysłaniu potwierdzenia przyjęcia lub aneksu do podpisu.
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Lista dokumentów zlecenia">
      {documents.map((doc) => {
        const statusMeta = STATUS_META[doc.status];
        const StatusIcon = statusMeta.Icon;
        const kindLabel = KIND_LABEL[doc.kind];
        const title = doc.title?.trim() || kindLabel;
        const canDownloadOriginal = !!doc.originalPdfFileId;
        const canDownloadSigned =
          !!doc.signedPdfFileId || doc.documensoDocId != null;
        return (
          <li
            key={doc.id}
            className="flex items-start gap-3 p-3 rounded-xl border"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}
              aria-hidden="true"
            >
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-main)" }}
                >
                  {title}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                  style={{
                    background: statusMeta.bg,
                    color: statusMeta.fg,
                  }}
                  aria-label={`Status dokumentu: ${statusMeta.label}`}
                >
                  <StatusIcon className="w-3 h-3" aria-hidden="true" />
                  {statusMeta.label}
                </span>
              </div>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                {kindLabel} · {formatRelative(doc.createdAt)}
                {doc.createdByEmail ? ` · ${doc.createdByEmail}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {canDownloadOriginal ? (
                  <a
                    href={downloadHref(serviceId, doc.id, "original")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Pobierz oryginał
                  </a>
                ) : null}
                {canDownloadSigned ? (
                  <a
                    href={downloadHref(serviceId, doc.id, "signed")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                    }}
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Pobierz podpisany
                  </a>
                ) : null}
                {doc.documensoSigningUrl ? (
                  <a
                    href={doc.documensoSigningUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Otwórz link do podpisu
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

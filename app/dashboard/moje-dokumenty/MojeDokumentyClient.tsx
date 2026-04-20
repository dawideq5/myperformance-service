"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSignature,
  Filter,
  Inbox,
  PenLine,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Input,
} from "@/components/ui";
import type {
  DocusealDocument,
  DocumentStats,
} from "@/lib/docuseal";

type Filter = "all" | "pending" | "completed" | "declined" | "expired";

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" | "info" }> = {
  pending: { label: "Do podpisu", tone: "warning" },
  awaiting: { label: "Oczekuje", tone: "warning" },
  sent: { label: "Wysłane", tone: "info" },
  opened: { label: "Otwarte", tone: "info" },
  completed: { label: "Podpisany", tone: "success" },
  declined: { label: "Odrzucony", tone: "danger" },
  expired: { label: "Wygasł", tone: "neutral" },
};

const FILTER_LABEL: Record<Filter, string> = {
  all: "Wszystkie",
  pending: "Do podpisu",
  completed: "Podpisane",
  declined: "Odrzucone",
  expired: "Wygasłe",
};

export function MojeDokumentyClient({
  initialDocuments,
  initialStats,
  userEmail,
}: {
  initialDocuments: DocusealDocument[];
  initialStats: DocumentStats;
  userEmail: string;
}) {
  const [docs, setDocs] = useState(initialDocuments);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<DocusealDocument | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) setDocs(data.documents);
        if (data.stats) setStats(data.stats);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(() => void reload(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "all" && d.status !== filter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.templateName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [docs, filter, search]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Łącznie"
          value={stats.total}
          icon={<Inbox className="w-5 h-5 text-[var(--accent)]" />}
          accent="bg-[var(--accent)]/10"
        />
        <Kpi
          label="Do podpisu"
          value={stats.pending}
          icon={<Clock className="w-5 h-5 text-amber-500" />}
          accent="bg-amber-500/10"
        />
        <Kpi
          label="Podpisane"
          value={stats.completed}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          accent="bg-emerald-500/10"
        />
        <Kpi
          label="Zakończone inaczej"
          value={stats.declined + stats.expired}
          icon={<XCircle className="w-5 h-5 text-red-500" />}
          accent="bg-red-500/10"
        />
      </div>

      <Card padding="sm" className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Filter className="w-4 h-4" aria-hidden />
          Filtr:
        </div>
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-lg ${
              filter === f
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Szukaj dokumentu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" aria-hidden />}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />}
          onClick={() => void reload()}
        >
          Odśwież
        </Button>
      </Card>

      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <FileSignature className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" aria-hidden />
          <h2 className="text-lg font-medium text-[var(--text-main)] mb-2">
            Brak dokumentów
          </h2>
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
            {docs.length === 0
              ? `Gdy administrator wyśle do Ciebie dokument do podpisu, pojawi się tutaj. Szukamy pod adresem `
              : "Zmień filtr lub wyszukiwaną frazę. "}
            {docs.length === 0 ? <strong>{userEmail}</strong> : null}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.submitterId || doc.id}
              document={doc}
              onOpen={() => setActive(doc)}
            />
          ))}
        </div>
      )}

      <SignDialog
        document={active}
        onClose={() => setActive(null)}
        onCompleted={() => {
          setActive(null);
          void reload();
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold text-[var(--text-main)] leading-tight mt-0.5">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function DocumentRow({
  document: doc,
  onOpen,
}: {
  document: DocusealDocument;
  onOpen: () => void;
}) {
  const self = doc.signers.find((s) => s.self);
  const status = STATUS_LABEL[doc.status] ?? { label: doc.status, tone: "neutral" as const };
  const canSign = self && self.status !== "completed" && (doc.signUrl || doc.embedSrc);

  return (
    <Card
      padding="md"
      className="relative flex items-center gap-4 hover:border-[var(--accent)]/40 transition-colors cursor-pointer"
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl"
        aria-label="Szczegóły"
      />
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          doc.status === "completed"
            ? "bg-emerald-500/10"
            : doc.status === "declined"
              ? "bg-red-500/10"
              : "bg-amber-500/10"
        }`}
      >
        <FileSignature
          className={`w-5 h-5 ${
            doc.status === "completed"
              ? "text-emerald-500"
              : doc.status === "declined"
                ? "text-red-500"
                : "text-amber-500"
          }`}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1 relative z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[var(--text-main)] font-medium truncate">{doc.name}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Utworzony {formatDate(doc.createdAt)}
          {doc.completedAt ? ` · Podpisany ${formatDate(doc.completedAt)}` : ""}
          {doc.expiresAt ? ` · Termin ${formatDate(doc.expiresAt)}` : ""}
        </p>
        {doc.signers.length > 1 ? (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {doc.signers.length} podpisujących ·{" "}
            {doc.signers.filter((s) => s.status === "completed").length} podpisanych
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
        {canSign ? (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            leftIcon={<PenLine className="w-4 h-4" aria-hidden />}
          >
            Podpisz
          </Button>
        ) : doc.status === "completed" ? (
          <a
            href={doc.downloadUrl ?? "#"}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Button variant="secondary" leftIcon={<Download className="w-4 h-4" aria-hidden />}>
              Pobierz
            </Button>
          </a>
        ) : null}
      </div>
    </Card>
  );
}

function SignDialog({
  document: doc,
  onClose,
  onCompleted,
}: {
  document: DocusealDocument | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (typeof e.data !== "object" || !e.data) return;
      const data = e.data as { type?: string };
      if (data.type === "form.completed" || data.type === "form_completed") {
        onCompleted();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCompleted]);

  if (!doc) return null;
  const self = doc.signers.find((s) => s.self);
  const canSign = self && self.status !== "completed" && (doc.embedSrc || doc.signUrl);
  const status = STATUS_LABEL[doc.status] ?? { label: doc.status, tone: "neutral" as const };

  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      size={canSign ? "lg" : "md"}
      title={doc.name}
      description={
        <span className="inline-flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span>Utworzono {formatDate(doc.createdAt)}</span>
        </span>
      }
      labelledById="moje-dokument-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
          {doc.status === "completed" && doc.downloadUrl ? (
            <a href={doc.downloadUrl} target="_blank" rel="noreferrer">
              <Button leftIcon={<Download className="w-4 h-4" aria-hidden />}>Pobierz</Button>
            </a>
          ) : null}
          {canSign && doc.signUrl ? (
            <a href={doc.signUrl} target="_blank" rel="noreferrer">
              <Button variant="secondary" rightIcon={<ExternalLink className="w-4 h-4" aria-hidden />}>
                Otwórz w nowej karcie
              </Button>
            </a>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <h4 className="text-xs uppercase text-[var(--text-muted)] tracking-wider mb-2">
            Podpisujący
          </h4>
          <ul className="space-y-2">
            {doc.signers.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]/40"
              >
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-main)] truncate">
                    {s.name || s.email} {s.self ? <Badge tone="info">Ty</Badge> : null}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {s.email}
                    {s.signedAt ? ` · podpisano ${formatDate(s.signedAt)}` : ""}
                  </div>
                </div>
                <Badge tone={STATUS_LABEL[s.status]?.tone ?? "neutral"}>
                  {STATUS_LABEL[s.status]?.label ?? s.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {canSign && (doc.embedSrc || doc.signUrl) ? (
          <div>
            <h4 className="text-xs uppercase text-[var(--text-muted)] tracking-wider mb-2">
              Podpis
            </h4>
            <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-white">
              <iframe
                src={doc.embedSrc || doc.signUrl}
                title={`Podpis: ${doc.name}`}
                className="w-full h-[500px]"
                allow="clipboard-write; fullscreen"
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Po zakończeniu podpisu dokument odświeży się automatycznie.
            </p>
          </div>
        ) : null}

        {doc.auditLogUrl ? (
          <a
            href={doc.auditLogUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Audit log <ArrowUpRight className="w-3 h-3" />
          </a>
        ) : null}
      </div>

      {confirmOpen ? (
        <Alert tone="info" className="mt-3">
          Dokument w trakcie przetwarzania…
        </Alert>
      ) : null}
    </Dialog>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

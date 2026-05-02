"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import type { ServicePhotoStage } from "@/lib/serwisant/types";

const STAGE_LABELS: Record<ServicePhotoStage, string> = {
  intake: "Przyjęcie",
  diagnosis: "Diagnoza",
  in_repair: "W naprawie",
  before_delivery: "Przed wydaniem",
  other: "Inne",
};

interface IssueResponse {
  token: string;
  url: string;
  expiresAt: string;
  stage: ServicePhotoStage;
  serviceId: string;
  ticketNumber?: string | null;
}

interface StatusResponse {
  valid: boolean;
  expiresAt?: string;
  serviceId?: string;
  ticketNumber?: string | null;
  stage?: string;
  photosUploaded?: number;
  reason?: string;
}

interface QrUploadModalProps {
  open: boolean;
  serviceId: string;
  defaultStage: ServicePhotoStage;
  onClose: () => void;
  /** Called when at least one mobile upload was registered, so the parent can
   * refresh its photo gallery. Fired on close, not on every poll, to avoid
   * flooding network. */
  onUploadsDetected?: (count: number) => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "wygasło";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function QrUploadModal({
  open,
  serviceId,
  defaultStage,
  onClose,
  onUploadsDetected,
}: QrUploadModalProps) {
  const [stage, setStage] = useState<ServicePhotoStage>(defaultStage);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssueResponse | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [copied, setCopied] = useState(false);
  const lastReportedRef = useRef(0);

  // Reset when re-opened
  useEffect(() => {
    if (open) {
      setStage(defaultStage);
      setIssued(null);
      setQrSvg(null);
      setStatus(null);
      setIssueError(null);
      setCopied(false);
      lastReportedRef.current = 0;
    }
  }, [open, defaultStage]);

  // Countdown
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // ESC close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const issueToken = useCallback(async () => {
    setIssueLoading(true);
    setIssueError(null);
    setIssued(null);
    setQrSvg(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/relay/upload-bridge/issue-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, stage }),
      });
      const json = (await res.json()) as IssueResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setIssued(json);
      // Render QR as SVG (sharper than canvas, no extra DOM updates).
      const svg = await QRCode.toString(json.url, {
        type: "svg",
        margin: 1,
        width: 280,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      setQrSvg(svg);
    } catch (err) {
      setIssueError(
        err instanceof Error
          ? err.message
          : "Nie udało się wygenerować linku.",
      );
    } finally {
      setIssueLoading(false);
    }
  }, [serviceId, stage]);

  // Poll status while we have a token
  useEffect(() => {
    if (!issued?.token) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/relay/upload-bridge/status/${encodeURIComponent(issued.token)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as StatusResponse;
        if (!cancelled) setStatus(json);
      } catch {
        // ignore — next tick will try again
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [issued?.token]);

  const expiresMs = useMemo(() => {
    if (!issued?.expiresAt) return 0;
    return new Date(issued.expiresAt).getTime() - now;
  }, [issued?.expiresAt, now]);

  const expired = !!issued && expiresMs <= 0;
  const photosUploaded = status?.photosUploaded ?? 0;

  // Track last seen count so the parent only fires onChange when something
  // actually changed (avoids needless re-renders of the gallery).
  useEffect(() => {
    lastReportedRef.current = photosUploaded;
  }, [photosUploaded]);

  const handleClose = useCallback(() => {
    if (lastReportedRef.current > 0) {
      onUploadsDetected?.(lastReportedRef.current);
    }
    onClose();
  }, [onClose, onUploadsDetected]);

  const copyUrl = useCallback(async () => {
    if (!issued?.url) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [issued?.url]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Upload zdjęć przez QR"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-5 shadow-xl"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-full p-1.5"
          style={{ color: "var(--text-muted)" }}
          aria-label="Zamknij"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-1 pr-8">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            Upload przez telefon
          </p>
          <h2 className="text-base font-semibold leading-tight">
            Zeskanuj QR aby dodać zdjęcia
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Telefon nie potrzebuje certyfikatu — link jest jednorazowy i
            ważny 30 minut.
          </p>
        </div>

        {!issued && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span
                className="mb-1 block text-[11px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Etap dokumentacji
              </span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as ServicePhotoStage)}
                className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                {(Object.keys(STAGE_LABELS) as ServicePhotoStage[]).map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void issueToken()}
              disabled={issueLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {issueLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Wygeneruj kod QR
            </button>

            {issueError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg p-2 text-xs"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#fca5a5",
                }}
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{issueError}</span>
              </div>
            )}
          </div>
        )}

        {issued && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col items-center gap-3">
              {qrSvg ? (
                <div
                  className="rounded-2xl bg-white p-3"
                  // QR svg is generated client-side from a trusted URL — safe.
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  aria-label="Kod QR z linkiem upload"
                />
              ) : (
                <div
                  className="flex h-[280px] w-[280px] items-center justify-center rounded-2xl bg-white"
                  style={{ color: "#94a3b8" }}
                >
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              <div className="flex w-full items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={issued.url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 truncate rounded-lg border px-2 py-1.5 text-[11px] outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                  aria-label="Link upload"
                />
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px]"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: copied ? "#86efac" : "var(--text-main)",
                  }}
                  aria-label="Skopiuj link"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "OK" : "Kopiuj"}
                </button>
              </div>
            </div>

            <div
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-surface)",
              }}
            >
              <span className="flex items-center gap-2">
                <Clock
                  className="h-3.5 w-3.5"
                  style={{
                    color: expired ? "#fca5a5" : "var(--accent)",
                  }}
                />
                <span
                  style={{
                    color: expired ? "#fca5a5" : "var(--text-main)",
                  }}
                >
                  Ważny: {formatRemaining(expiresMs)}
                </span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                Etap: {STAGE_LABELS[issued.stage] ?? issued.stage}
              </span>
            </div>

            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{
                borderColor: "var(--border-subtle)",
                background: photosUploaded > 0
                  ? "rgba(34, 197, 94, 0.08)"
                  : "var(--bg-surface)",
                color: photosUploaded > 0 ? "#86efac" : "var(--text-muted)",
              }}
              aria-live="polite"
            >
              {photosUploaded > 0
                ? `Odebrano ${photosUploaded} ${photosUploaded === 1 ? "zdjęcie" : photosUploaded < 5 ? "zdjęcia" : "zdjęć"} z urządzenia mobilnego.`
                : "Czeka na uploady z telefonu…"}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void issueToken()}
                disabled={issueLoading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                {issueLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                Nowy kod
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Zakończ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

interface StatusResponse {
  valid: boolean;
  expiresAt?: string;
  serviceId?: string;
  ticketNumber?: string | null;
  stage?: string;
  photosUploaded?: number;
  reason?: string;
}

interface UploadedPhoto {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  filename: string | null;
  stage: string | null;
}

type ItemStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  localId: string;
  file: File;
  status: ItemStatus;
  progress: number;
  error: string | null;
  photo: UploadedPhoto | null;
}

const STAGE_LABELS: Record<string, string> = {
  intake: "Przyjęcie",
  diagnosis: "Diagnoza",
  in_repair: "W naprawie",
  before_delivery: "Przed wydaniem",
  other: "Inne",
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "wygasło";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function genLocalId(): string {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface UploadClientProps {
  token: string;
}

/**
 * Upload Bridge — dark theme spójny z myperformance.pl. Mobilna sesja
 * przesyłania zdjęć powiązana z tokenowym QR z panelu serwisanta.
 *
 * Design:
 *   - Header z brandowanym logo serwis-by-caseownia + kontekst zlecenia.
 *   - Card-based UI: var(--bg-card) nad var(--bg-main).
 *   - Accent indigo (var(--accent)) dla primary action (Camera CTA).
 *   - prefers-reduced-motion: animacja fade-in jest disabled.
 */
export function UploadClient({ token }: UploadClientProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const res = await fetch(
        `/api/status/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as StatusResponse;
      setStatus(json);
      if (!json.valid && json.reason) setStatusError(json.reason);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Nie udało się pobrać statusu",
      );
    } finally {
      setStatusLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Periodic status refresh — every 10s, only while valid.
  useEffect(() => {
    if (!status?.valid) return;
    const id = window.setInterval(() => void refreshStatus(), 10_000);
    return () => window.clearInterval(id);
  }, [refreshStatus, status?.valid]);

  // Countdown tick — 1s.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expiresMs = useMemo(() => {
    if (!status?.expiresAt) return 0;
    const t = new Date(status.expiresAt).getTime();
    return t - now;
  }, [status?.expiresAt, now]);

  const uploadOne = useCallback(
    async (localId: string, file: File) => {
      setItems((prev) =>
        prev.map((i) =>
          i.localId === localId
            ? { ...i, status: "uploading", progress: 5, error: null }
            : i,
        ),
      );
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(
          `/api/upload/${encodeURIComponent(token)}`,
          { method: "POST", body: fd },
        );
        if (res.status === 429) {
          setItems((prev) =>
            prev.map((i) =>
              i.localId === localId
                ? {
                    ...i,
                    status: "error",
                    progress: 0,
                    error: "Zbyt wiele uploadów — odczekaj chwilę.",
                  }
                : i,
            ),
          );
          return;
        }
        const json = (await res.json()) as {
          photo?: UploadedPhoto;
          error?: string;
        };
        if (!res.ok || !json.photo) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setItems((prev) =>
          prev.map((i) =>
            i.localId === localId
              ? {
                  ...i,
                  status: "done",
                  progress: 100,
                  error: null,
                  photo: json.photo ?? null,
                }
              : i,
          ),
        );
        // refresh server-side counter
        void refreshStatus();
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.localId === localId
              ? {
                  ...i,
                  status: "error",
                  progress: 0,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Nie udało się wysłać zdjęcia",
                }
              : i,
          ),
        );
      }
    },
    [token, refreshStatus],
  );

  const queueFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const next: UploadItem[] = [];
      for (const file of Array.from(files)) {
        if (!ALLOWED_MIME.includes(file.type)) {
          next.push({
            localId: genLocalId(),
            file,
            status: "error",
            progress: 0,
            error: "Format niewspierany (JPEG/PNG/WebP/HEIC).",
            photo: null,
          });
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          next.push({
            localId: genLocalId(),
            file,
            status: "error",
            progress: 0,
            error: `Plik większy niż ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
            photo: null,
          });
          continue;
        }
        next.push({
          localId: genLocalId(),
          file,
          status: "pending",
          progress: 0,
          error: null,
          photo: null,
        });
      }
      setItems((prev) => [...next, ...prev]);
      // Trigger uploads sequentially (simpler, fewer rate-limit collisions).
      void (async () => {
        for (const it of next) {
          if (it.status === "pending") {
            await uploadOne(it.localId, it.file);
          }
        }
      })();
    },
    [uploadOne],
  );

  const removeItem = (localId: string) => {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  };

  const expired = status?.valid && expiresMs <= 0;
  const tokenInvalid = status && status.valid === false;
  const sessionDone = expired || tokenInvalid;

  if (statusLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 py-12">
        <div
          className="flex items-center gap-3 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Sprawdzam link…
        </div>
      </main>
    );
  }

  if (tokenInvalid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center mp-fade-in">
        <BrandHeader />
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-main)" }}>
            Link nie jest aktywny
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {status?.reason ??
              "Token wygasł lub został unieważniony. Wygeneruj nowy QR z panelu serwisanta."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 py-6 sm:py-8 mp-fade-in">
      <BrandHeader />

      <header
        className="rounded-2xl border p-4"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              Upload zdjęć
            </p>
            <h1
              className="text-lg font-semibold leading-tight truncate"
              style={{ color: "var(--text-main)" }}
            >
              Zlecenie {status?.ticketNumber ?? status?.serviceId ?? "—"}
            </h1>
            {status?.stage && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Etap:{" "}
                <span
                  className="font-medium"
                  style={{ color: "var(--text-main)" }}
                >
                  {STAGE_LABELS[status.stage] ?? status.stage}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium"
              style={{
                background: expired
                  ? "rgba(239, 68, 68, 0.12)"
                  : "rgba(16, 185, 129, 0.12)",
                color: expired ? "var(--error)" : "var(--success)",
              }}
              aria-live="polite"
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatRemaining(expiresMs)}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              {status?.photosUploaded ?? 0} przesłanych
            </span>
          </div>
        </div>
      </header>

      {statusError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "var(--error)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{statusError}</span>
        </div>
      )}

      {!sessionDone && (
        <section
          className="space-y-3 rounded-2xl border p-4"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-main)" }}
          >
            Dodaj zdjęcia
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              aria-label="Zrób zdjęcie aparatem"
              onChange={(e) => {
                queueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="Wybierz zdjęcia z galerii"
              onChange={(e) => {
                queueFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{
                background: "var(--accent)",
                color: "#fff",
                boxShadow: "0 8px 22px -10px rgba(99, 102, 241, 0.6)",
              }}
            >
              <Camera className="h-6 w-6" aria-hidden="true" />
              Zrób zdjęcie
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <ImagePlus
                className="h-6 w-6"
                aria-hidden="true"
                style={{ color: "var(--accent)" }}
              />
              Z galerii
            </button>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            JPEG / PNG / WebP / HEIC, max{" "}
            {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Możesz wybrać kilka
            naraz.
          </p>
        </section>
      )}

      {sessionDone && (
        <section
          className="rounded-2xl border p-4 text-center"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <CheckCircle2
            className="mx-auto h-8 w-8"
            style={{ color: "var(--success)" }}
            aria-hidden="true"
          />
          <p
            className="mt-2 text-sm font-medium"
            style={{ color: "var(--text-main)" }}
          >
            Sesja zakończona
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Wygeneruj nowy QR z panelu, aby przesłać kolejne zdjęcia.
          </p>
        </section>
      )}

      {items.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              W tej sesji
            </h2>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
              aria-label="Odśwież status"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" /> Odśwież
            </button>
          </div>
          <ul className="space-y-2" role="list">
            {items.map((it) => (
              <li
                key={it.localId}
                className="flex items-center gap-3 rounded-xl border p-2"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <PreviewThumb item={it} />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--text-main)" }}
                  >
                    {it.file.name}
                  </p>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {(it.file.size / 1024).toFixed(0)} kB ·{" "}
                    {it.status === "uploading"
                      ? "wysyłanie…"
                      : it.status === "done"
                        ? "wysłane"
                        : it.status === "error"
                          ? "błąd"
                          : "w kolejce"}
                  </p>
                  {it.status === "uploading" && (
                    <div
                      className="mt-1 h-1 w-full overflow-hidden rounded-full"
                      style={{ background: "rgba(255, 255, 255, 0.06)" }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(it.progress, 8)}%`,
                          background: "var(--accent)",
                          transition: "width 200ms ease-out",
                        }}
                      />
                    </div>
                  )}
                  {it.error && (
                    <p
                      className="mt-1 text-[11px]"
                      style={{ color: "var(--error)" }}
                    >
                      {it.error}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {it.status === "uploading" && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      style={{ color: "var(--accent)" }}
                      aria-label="Wysyłanie"
                    />
                  )}
                  {it.status === "done" && (
                    <CheckCircle2
                      className="h-4 w-4"
                      style={{ color: "var(--success)" }}
                      aria-label="Wysłane"
                    />
                  )}
                  {it.status === "error" && (
                    <button
                      type="button"
                      onClick={() => removeItem(it.localId)}
                      className="rounded-full p-1"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Usuń wpis"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer
        className="pt-4 text-center text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        myperformance.pl · Upload Bridge
      </footer>
    </main>
  );
}

function BrandHeader() {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{
        background: "var(--bg-header)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <Image
        src="/logo.png"
        alt="Serwis by Caseownia"
        width={40}
        height={40}
        priority
        className="rounded-lg"
      />
      <div className="min-w-0">
        <p
          className="text-sm font-semibold leading-tight truncate"
          style={{ color: "var(--text-main)" }}
        >
          Serwis by Caseownia
        </p>
        <p
          className="text-[11px] truncate"
          style={{ color: "var(--text-muted)" }}
        >
          Bezpieczny upload zdjęć
        </p>
      </div>
    </div>
  );
}

function PreviewThumb({ item }: { item: UploadItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file]);
  return (
    <div
      className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg"
      style={{ background: "var(--bg-surface)" }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

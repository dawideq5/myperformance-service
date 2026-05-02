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
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  QrCode,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ServicePhoto, ServicePhotoStage } from "@/lib/serwisant/types";
import { QrUploadModal } from "./QrUploadModal";

const STAGE_LABELS: Record<ServicePhotoStage, string> = {
  intake: "Przyjęcie",
  diagnosis: "Diagnoza",
  in_repair: "W naprawie",
  before_delivery: "Przed wydaniem",
  other: "Inne",
};

const STAGE_TONE: Record<
  ServicePhotoStage,
  { bg: string; fg: string; label: string }
> = {
  intake: {
    bg: "rgba(148, 163, 184, 0.16)",
    fg: "#cbd5e1",
    label: STAGE_LABELS.intake,
  },
  diagnosis: {
    bg: "rgba(59, 130, 246, 0.16)",
    fg: "#93c5fd",
    label: STAGE_LABELS.diagnosis,
  },
  in_repair: {
    bg: "rgba(245, 158, 11, 0.16)",
    fg: "#fcd34d",
    label: STAGE_LABELS.in_repair,
  },
  before_delivery: {
    bg: "rgba(34, 197, 94, 0.16)",
    fg: "#86efac",
    label: STAGE_LABELS.before_delivery,
  },
  other: {
    bg: "rgba(100, 116, 139, 0.16)",
    fg: "#94a3b8",
    label: STAGE_LABELS.other,
  },
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (panel-side guard; backend ma 15 MB)

interface PhotoGalleryProps {
  serviceId: string;
  /** Filter; gdy `undefined`, pokazuje wszystkie etapy. */
  stage?: ServicePhotoStage;
  /** Pozwala uploadować i usuwać. Domyślnie `true`. */
  editable?: boolean;
  /** Wywoływane po udanym upload/delete — np. do refresh danych zlecenia. */
  onChange?: () => void;
}

export function PhotoGallery({
  serviceId,
  stage,
  editable = true,
  onChange,
}: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Upload UI state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingStage, setPendingStage] = useState<ServicePhotoStage>(
    stage ?? "intake",
  );
  const [pendingNote, setPendingNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // QR upload modal
  const [qrOpen, setQrOpen] = useState(false);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (stage) params.set("stage", stage);
      const url = `/api/relay/services/${encodeURIComponent(
        serviceId,
      )}/photos${params.size > 0 ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      const json = (await res.json()) as
        | { photos?: ServicePhoto[]; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setPhotos(Array.isArray(json?.photos) ? json.photos : []);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Nie udało się pobrać zdjęć",
      );
    } finally {
      setLoading(false);
    }
  }, [serviceId, stage]);

  useEffect(() => {
    void fetchPhotos();
  }, [fetchPhotos]);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.includes(file.type)) {
      return "Dozwolone formaty: JPEG, PNG, WebP";
    }
    if (file.size > MAX_FILE_BYTES) {
      return `Plik przekracza maksymalny rozmiar ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024,
      )} MB`;
    }
    return null;
  }, []);

  const onPickFile = (file: File | null) => {
    setUploadError(null);
    if (!file) {
      setPendingFile(null);
      return;
    }
    const err = validateFile(file);
    if (err) {
      setUploadError(err);
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
    setPendingStage(stage ?? "intake");
    setPendingNote("");
  };

  const submitUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", pendingFile);
      fd.set("stage", pendingStage);
      if (pendingNote.trim()) fd.set("note", pendingNote.trim());
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/photos`,
        { method: "POST", body: fd },
      );
      if (res.status === 429) {
        setUploadError("Zbyt wiele uploadów — spróbuj ponownie za chwilę.");
        return;
      }
      const json = (await res.json()) as
        | { photo?: ServicePhoto; error?: string; detail?: string }
        | null;
      if (!res.ok || !json?.photo) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setPhotos((prev) => [json.photo as ServicePhoto, ...prev]);
      setPendingFile(null);
      setPendingNote("");
      onChange?.();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Nie udało się dodać zdjęcia",
      );
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!confirm("Usunąć to zdjęcie?")) return;
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(
          serviceId,
        )}/photos/${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (lightboxIdx != null) {
        // adjust lightbox index after removal
        setLightboxIdx(null);
      }
      onChange?.();
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Nie udało się usunąć zdjęcia",
      );
    }
  };

  // Drag & drop handlers
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!editable) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onPickFile(file);
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const filteredPhotos = useMemo(
    () =>
      stage ? photos.filter((p) => p.stage === stage) : photos,
    [photos, stage],
  );

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);
  const nextLightbox = useCallback(() => {
    setLightboxIdx((i) => {
      if (i == null || filteredPhotos.length === 0) return null;
      return (i + 1) % filteredPhotos.length;
    });
  }, [filteredPhotos.length]);
  const prevLightbox = useCallback(() => {
    setLightboxIdx((i) => {
      if (i == null || filteredPhotos.length === 0) return null;
      return (i - 1 + filteredPhotos.length) % filteredPhotos.length;
    });
  }, [filteredPhotos.length]);

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/5"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
              background: "var(--bg-surface)",
            }}
            aria-label="Dodaj zdjęcia przez QR (telefon)"
            title="Wystaw QR i wgraj zdjęcia z telefonu"
          >
            <QrCode
              className="h-3.5 w-3.5"
              style={{ color: "var(--accent)" }}
              aria-hidden="true"
            />
            Dodaj przez QR (telefon)
          </button>
        </div>
      )}
      {editable && (
        <div
          role={pendingFile ? undefined : "button"}
          tabIndex={pendingFile ? -1 : 0}
          aria-label="Strefa upload zdjęć — kliknij lub przeciągnij plik"
          onClick={() => {
            if (!pendingFile) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !pendingFile) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className="rounded-2xl border-2 border-dashed p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          style={{
            background: dragOver
              ? "rgba(99, 102, 241, 0.08)"
              : "var(--bg-surface)",
            borderColor: dragOver ? "var(--accent)" : "var(--border-subtle)",
            color: "var(--text-main)",
            cursor: pendingFile ? "default" : "pointer",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME.join(",")}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onPickFile(f);
              e.target.value = "";
            }}
          />

          {!pendingFile ? (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 text-center sm:text-left">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent)",
                }}
              >
                <Upload className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Przeciągnij zdjęcie tutaj lub kliknij aby wybrać
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  JPEG / PNG / WebP, max{" "}
                  {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="text-sm font-medium truncate"
                  title={pendingFile.name}
                >
                  {pendingFile.name}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingFile(null);
                    setUploadError(null);
                  }}
                  className="p-1 rounded"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Anuluj wybór pliku"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <label className="block">
                  <span
                    className="block text-[11px] font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Etap
                  </span>
                  <select
                    value={pendingStage}
                    onChange={(e) => {
                      e.stopPropagation();
                      setPendingStage(e.target.value as ServicePhotoStage);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                    style={{
                      background: "var(--bg-card)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    {(Object.keys(STAGE_LABELS) as ServicePhotoStage[]).map(
                      (s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label className="block">
                <span
                  className="block text-[11px] font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Notatka (opcjonalna)
                </span>
                <input
                  type="text"
                  value={pendingNote}
                  onChange={(e) => {
                    e.stopPropagation();
                    setPendingNote(e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="np. detal pęknięcia ekranu"
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void submitUpload();
                  }}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Wyślij zdjęcie
                </button>
              </div>
            </div>
          )}

          {uploadError && (
            <div
              role="alert"
              className="mt-3 p-2 rounded-lg flex items-start gap-2 text-xs"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}

      {/* Photos grid */}
      {loading ? (
        <div
          className="flex items-center gap-2 text-sm p-4"
          style={{ color: "var(--text-muted)" }}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Wczytywanie zdjęć…
        </div>
      ) : listError ? (
        <div
          role="alert"
          className="p-3 rounded-lg flex items-start gap-2 text-sm"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "#fca5a5",
          }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{listError}</span>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div
          className="rounded-xl border p-6 flex flex-col items-center gap-2 text-center"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <ImageIcon className="w-6 h-6" />
          <p className="text-sm">Brak zdjęć</p>
          {editable && (
            <p className="text-xs">
              Dodaj pierwsze zdjęcie używając strefy powyżej.
            </p>
          )}
        </div>
      ) : (
        <ul
          role="list"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
        >
          {filteredPhotos.map((photo, idx) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              editable={editable}
              onOpen={() => openLightbox(idx)}
              onDelete={() => void deletePhoto(photo.id)}
            />
          ))}
        </ul>
      )}

      {lightboxIdx != null && filteredPhotos[lightboxIdx] && (
        <PhotoLightbox
          photos={filteredPhotos}
          index={lightboxIdx}
          onClose={closeLightbox}
          onPrev={prevLightbox}
          onNext={nextLightbox}
        />
      )}

      {editable && (
        <QrUploadModal
          open={qrOpen}
          serviceId={serviceId}
          defaultStage={stage ?? "intake"}
          onClose={() => {
            setQrOpen(false);
            // Refresh on close to pick up any uploads done via mobile.
            void fetchPhotos();
          }}
          onUploadsDetected={() => {
            onChange?.();
          }}
        />
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  editable,
  onOpen,
  onDelete,
}: {
  photo: ServicePhoto;
  editable: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const tone = STAGE_TONE[photo.stage] ?? STAGE_TONE.other;
  const url = photo.thumbnailUrl ?? photo.url ?? null;
  const altText = `Zdjęcie ${tone.label}${
    photo.filename ? ` — ${photo.filename}` : ""
  }`;
  const dt = photo.uploadedAt
    ? new Date(photo.uploadedAt).toLocaleString("pl-PL")
    : "";

  return (
    <li
      className="relative rounded-xl overflow-hidden border group"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Otwórz podgląd: ${altText}`}
        className="block w-full aspect-square overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={altText}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: "var(--text-muted)" }}
          >
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </button>

      <div className="absolute top-1 left-1 flex items-center gap-1">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: tone.bg,
            color: tone.fg,
          }}
        >
          {tone.label}
        </span>
      </div>

      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{
            background: "rgba(0,0,0,0.55)",
            color: "#fca5a5",
          }}
          aria-label="Usuń zdjęcie"
          title="Usuń zdjęcie"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      <div
        className="px-2 py-1 text-[10px] flex items-center justify-between gap-1"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="truncate" title={photo.uploadedBy ?? ""}>
          {photo.uploadedBy ?? "—"}
        </span>
        <span className="flex-shrink-0">{dt}</span>
      </div>
    </li>
  );
}

/**
 * Lightbox — fullscreen modal z prev/next + ESC close + swipe na mobile.
 * Bez zewnętrznych zależności żeby nie ciągnąć kolejnego pakietu do paneli.
 */
function PhotoLightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: ServicePhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  if (!photo) return null;

  const tone = STAGE_TONE[photo.stage] ?? STAGE_TONE.other;
  const url = photo.url ?? photo.thumbnailUrl ?? null;
  const altText = `Zdjęcie ${tone.label}${
    photo.filename ? ` — ${photo.filename}` : ""
  }`;

  return (
    <div
      className="fixed inset-0 z-[2050] flex items-center justify-center p-2 sm:p-6"
      style={{ background: "rgba(0,0,0,0.85)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Podgląd zdjęcia"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
        const dx = endX - touchStartX.current;
        if (Math.abs(dx) > 60) {
          if (dx > 0) onPrev();
          else onNext();
        }
        touchStartX.current = null;
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 p-2 rounded-full"
        style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
        aria-label="Zamknij podgląd"
      >
        <X className="w-5 h-5" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
            aria-label="Poprzednie zdjęcie"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
            aria-label="Następne zdjęcie"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <figure className="max-w-full max-h-full flex flex-col items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={altText}
            className="max-h-[80vh] max-w-full object-contain rounded-xl"
          />
        ) : (
          <div
            className="rounded-xl p-12 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}
          >
            <ImageIcon className="w-12 h-12" />
          </div>
        )}
        <figcaption
          className="text-xs flex items-center gap-3 px-4 py-2 rounded-full max-w-full"
          style={{
            background: "rgba(0,0,0,0.6)",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {tone.label}
          </span>
          <span className="truncate">
            {photo.filename ?? "—"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>
            {index + 1} / {photos.length}
          </span>
        </figcaption>
        {photo.note && (
          <p
            className="text-xs px-4 py-1.5 rounded-lg max-w-md text-center"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {photo.note}
          </p>
        )}
      </figure>
    </div>
  );
}

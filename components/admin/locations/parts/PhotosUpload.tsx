"use client";

import { useCallback, useId, useState } from "react";
import { Activity, Plus, X } from "lucide-react";
import { MAX_PHOTOS } from "@/lib/services/locations-service";

/**
 * Upload zdjęć do Directus folderu "locations". Wymusza limit MAX_PHOTOS,
 * używa label[htmlFor]+sr-only input zamiast programmatic .click() — niezawodny
 * file picker w Safari/Firefox (programmatic click bywa blokowany przez user-
 * gesture requirements).
 */
export function PhotosUpload({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (p: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const remaining = MAX_PHOTOS - photos.length;

  const onFile = useCallback(
    async (file: File) => {
      if (photos.length >= MAX_PHOTOS) {
        setError(`Osiągnięto limit ${MAX_PHOTOS} zdjęć`);
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("filename", file.name);
        const res = await fetch("/api/locations/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { data: { url: string } };
        onChange([...photos, data.data.url].slice(0, MAX_PHOTOS));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload nieudany");
      } finally {
        setUploading(false);
      }
    },
    [photos, onChange],
  );

  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[var(--text-muted)]">
        Zdjęcia (max {MAX_PHOTOS}) — wgraj plik z dysku, zostanie zapisany w
        Directus
      </label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, idx) => (
          <div
            key={idx}
            className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Zdjęcie ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, i) => i !== idx))}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-red-500/80 transition"
              aria-label="Usuń zdjęcie"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <>
            <label
              htmlFor={inputId}
              className={`aspect-square rounded-lg border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent)]/50 flex flex-col items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition cursor-pointer ${
                uploading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {uploading ? (
                <>
                  <Activity className="w-5 h-5 animate-spin" />
                  <span className="text-[10px] mt-1">Wgrywanie…</span>
                </>
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px] mt-1">Wgraj zdjęcie</span>
                </>
              )}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = ""; // reset żeby ten sam plik dało się wgrać ponownie
              }}
            />
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

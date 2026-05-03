"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, QrCode } from "lucide-react";

import { LivestreamPublisher } from "@/components/LivestreamPublisher";

/**
 * Mobile publisher PWA — Wave 22 / F16c.
 *
 * Wejście: deeplink z QR generowanego przez `POST /api/livekit/request-view`
 * (F16b) — `https://upload.myperformance.pl/livestream?room=X&token=Y`.
 *
 * Po stronie klienta:
 *   - Walidujemy obecność `room` + `token` (jeden brak → komunikat + CTA do
 *     strony głównej).
 *   - Renderujemy `<LivestreamPublisher />` w trybie full-screen mobile —
 *     bez headera/footera, video viewport pokrywa cały viewport (komponent
 *     używa `fixed inset-0`).
 *
 * Dlaczego `"use client"` na page? Czytamy query string z
 * `window.location.search` w `useEffect` (omija Suspense boundary jakie
 * narzuciłby `useSearchParams`) i unikamy renderowania
 * `<LivestreamPublisher />` na serwerze, gdzie `navigator.mediaDevices`
 * nie istnieje.
 *
 * Initial HTML jest pusty (placeholder background) — full hydration
 * dzieje się client-side, więc jakikolwiek prerender (static / dynamic)
 * jest nieistotny. Nie ustawiamy `force-dynamic` żeby trzymać statyczny
 * shell.
 */

export default function LivestreamPage() {
  const [params, setParams] = useState<{
    room: string | null;
    token: string | null;
    ready: boolean;
  }>({ room: null, token: null, ready: false });

  // Czytamy z `window.location.search` zamiast `useSearchParams` żeby
  // uniknąć Suspense boundary requirements w Next.js 15 i nie hydratować
  // tego ekranu drugi raz.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    setParams({
      room: sp.get("room"),
      token: sp.get("token"),
      ready: true,
    });
  }, []);

  const valid = useMemo(
    () =>
      params.ready &&
      typeof params.room === "string" &&
      params.room.length > 0 &&
      typeof params.token === "string" &&
      params.token.length > 0,
    [params],
  );

  if (!params.ready) {
    return (
      <main
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "var(--bg-main)" }}
      />
    );
  }

  if (!valid) {
    return (
      <main
        className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ background: "var(--bg-main)", color: "var(--text-main)" }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            color: "var(--error)",
          }}
        >
          <AlertCircle className="h-10 w-10" aria-hidden="true" />
        </div>
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-semibold">Nieprawidłowy link</h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Brakuje parametrów pokoju lub tokenu. Wygeneruj nowy kod QR z panelu
            serwisanta i zeskanuj go ponownie.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <QrCode className="h-5 w-5" aria-hidden="true" />
          Wróć na stronę główną
        </Link>
      </main>
    );
  }

  return (
    <LivestreamPublisher
      room={params.room as string}
      token={params.token as string}
    />
  );
}

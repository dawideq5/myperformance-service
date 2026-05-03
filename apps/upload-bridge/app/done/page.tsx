import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-static";

/**
 * /done — landing po zakończeniu sesji live view (Wave 22 / F16c).
 *
 * Klient mobile (sprzedawca) trafia tu po kliknięciu "Zakończ rozmowę"
 * w `<LivestreamPublisher />` (po `room.disconnect()`). Strona jest
 * świadomie minimalistyczna — żadnego "Connect again" CTA, bo każda
 * sesja wymaga świeżego tokenu z panelu serwisanta.
 */
export default function DonePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center mp-fade-in">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full"
        style={{
          background: "rgba(16, 185, 129, 0.12)",
          color: "var(--success)",
        }}
        aria-hidden="true"
      >
        <CheckCircle2 className="h-10 w-10" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dziękujemy
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Rozmowa została zakończona. Kamera i mikrofon zostały wyłączone.
          Możesz bezpiecznie zamknąć tę kartę.
        </p>
      </div>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        myperformance.pl · Live View
      </p>
    </main>
  );
}

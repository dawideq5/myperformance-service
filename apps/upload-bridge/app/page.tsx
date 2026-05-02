import Image from "next/image";
import { QrCode, Smartphone } from "lucide-react";

export const dynamic = "force-static";

/**
 * Strona startowa upload-bridge — dark theme spójny z myperformance.pl.
 * Brand z logiki dashboardu: czarny background, accent indigo, branding
 * serwis-by-caseownia.png. Bez direct loginu — dostęp tylko przez tokenowy
 * QR z panelu firmowego.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-12 text-center mp-fade-in">
      {/* Brand logo / mark */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--accent)",
          }}
          aria-hidden="true"
        >
          <QrCode className="h-9 w-9" />
        </div>
        <Image
          src="/logo.png"
          alt="Serwis by Caseownia"
          width={140}
          height={36}
          priority
          className="opacity-90"
        />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload zdjęć
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Aby przesłać zdjęcia do zlecenia, zeskanuj kod QR z panelu serwisanta.
          Otrzymasz dedykowany, czasowy link.
        </p>
      </div>

      <div
        className="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Smartphone
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: "var(--accent)" }}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>
            Dostęp tylko przez QR
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Ta usługa nie udostępnia bezpośredniego logowania — używaj tylko
            linków otrzymanych z panelu firmowego.
          </p>
        </div>
      </div>

      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        myperformance.pl · Upload Bridge
      </p>
    </main>
  );
}

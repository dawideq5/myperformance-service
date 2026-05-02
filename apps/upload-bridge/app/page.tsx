import { QrCode, Smartphone } from "lucide-react";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl"
        style={{
          background: "var(--brand-primary)",
          color: "#fff",
          boxShadow: "0 12px 30px -10px rgba(249, 115, 22, 0.5)",
        }}
        aria-hidden="true"
      >
        <QrCode className="h-10 w-10" />
      </div>

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload zdjęć
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--brand-muted)" }}
        >
          Aby przesłać zdjęcia do zlecenia, zeskanuj kod QR z panelu serwisanta.
          Otrzymasz dedykowany, czasowy link.
        </p>
      </div>

      <div
        className="flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-left"
        style={{ borderColor: "var(--brand-border)" }}
      >
        <Smartphone
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: "var(--brand-primary)" }}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium">Dostęp tylko przez QR</p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--brand-muted)" }}
          >
            Ta usługa nie udostępnia bezpośredniego logowania — używaj tylko
            linków otrzymanych z panelu firmowego.
          </p>
        </div>
      </div>
    </main>
  );
}

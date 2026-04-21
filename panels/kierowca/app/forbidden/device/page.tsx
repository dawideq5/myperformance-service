interface Props {
  searchParams?: { reason?: string };
}

export default function DeviceBlockedPage({ searchParams }: Props) {
  const reason = searchParams?.reason;
  return (
    <main
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: "var(--bg-main)" }}
    >
      <section
        className="max-w-md w-full rounded-2xl p-10 text-center border"
        style={{
          background: "var(--bg-card)",
          borderColor: "rgba(245, 158, 11, 0.4)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        }}
      >
        <h1 className="text-xl font-bold mb-3" style={{ color: "var(--text-main)" }}>
          Urządzenie zmieniło konfigurację
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Certyfikat został pierwotnie powiązany z innym urządzeniem. Aby chronić
          konto, dostęp z obecnego urządzenia został zablokowany.{" "}
          <strong style={{ color: "var(--text-main)" }}>
            Skontaktuj się z administratorem
          </strong>
          , aby odnowić powiązanie albo wystawić nowy certyfikat.
        </p>
        {reason && (
          <p className="mt-4 text-xs font-mono" style={{ color: "#fbbf24" }}>
            {reason}
          </p>
        )}
      </section>
    </main>
  );
}

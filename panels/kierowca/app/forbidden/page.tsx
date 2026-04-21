export default function ForbiddenPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: "var(--bg-main)" }}
    >
      <section
        className="max-w-md w-full rounded-2xl p-10 text-center border"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        }}
      >
        <h1 className="text-xl font-bold mb-3" style={{ color: "var(--text-main)" }}>
          Brak uprawnień
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Twoje konto nie posiada roli{" "}
          <code style={{ color: "var(--accent)" }}>kierowca</code>.
          Skontaktuj się z administratorem, jeśli uważasz, że to błąd.
        </p>
      </section>
    </main>
  );
}

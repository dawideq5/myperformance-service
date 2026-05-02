import Link from "next/link";

export const metadata = {
  title: "Zaloguj się",
};

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-4 md:px-6 py-12 md:py-20">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
        Zaloguj się
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        Logowanie przez Keycloak (realm <span className="font-mono">klienci</span>)
        zostanie uruchomione w drugiej fazie. Tymczasem możesz sprawdzić status
        zlecenia bez konta — wystarczy email i 6-cyfrowy kod.
      </p>
      <Link
        href="/status"
        className="inline-flex rounded-lg px-6 py-3 text-base font-medium"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        Sprawdź status bez konta
      </Link>
    </section>
  );
}

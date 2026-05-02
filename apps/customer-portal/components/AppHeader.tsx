import Link from "next/link";

export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 w-full border-b backdrop-blur"
      style={{
        background: "rgba(255,255,255,0.85)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          aria-label="Strona główna — Caseownia"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            C
          </span>
          <span>Caseownia</span>
          <span
            className="hidden sm:inline text-xs font-normal"
            style={{ color: "var(--text-muted)" }}
          >
            · Serwis telefonów
          </span>
        </Link>
        <nav
          className="flex items-center gap-3 text-sm"
          aria-label="Główna nawigacja"
        >
          <Link
            href="/status"
            className="px-3 py-1.5 rounded-md hover:bg-bg-muted transition-colors"
          >
            Sprawdź status
          </Link>
          <Link
            href="/help"
            className="hidden sm:inline px-3 py-1.5 rounded-md hover:bg-bg-muted transition-colors"
          >
            Pomoc
          </Link>
          <Link
            href="/auth/login"
            className="px-3 py-1.5 rounded-md font-medium border transition-colors hover:bg-bg-muted"
            style={{ borderColor: "var(--border-strong)" }}
          >
            Zaloguj
          </Link>
        </nav>
      </div>
    </header>
  );
}

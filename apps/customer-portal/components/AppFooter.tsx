import Link from "next/link";

export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t mt-16"
      style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm">
        <div style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>
            Caseownia
          </span>{" "}
          · Serwis telefonów · © {year}
        </div>
        <nav
          className="flex flex-wrap gap-x-5 gap-y-2"
          aria-label="Linki dolne"
        >
          <Link href="/regulations" className="hover:underline">
            Regulamin
          </Link>
          <Link href="/help" className="hover:underline">
            Pomoc
          </Link>
          <Link href="/status" className="hover:underline">
            Status zlecenia
          </Link>
        </nav>
      </div>
    </footer>
  );
}

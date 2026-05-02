import Link from "next/link";
import Image from "next/image";

export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t mt-16"
      style={{
        borderColor: "var(--border-subtle)",
        background: "var(--bg-card)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-10 grid gap-8 md:grid-cols-[auto_1fr_auto] md:items-start">
        <div className="flex items-center">
          <Image
            src="/logos/caseownia.jpeg"
            alt="Caseownia"
            width={1024}
            height={281}
            className="h-7 md:h-8 w-auto opacity-70"
          />
        </div>
        <nav
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
          aria-label="Linki dolne"
        >
          <Link
            href="/status"
            className="hover:underline"
            style={{ color: "var(--text-main)" }}
          >
            Sprawdź status
          </Link>
          <Link
            href="/help"
            className="hover:underline"
            style={{ color: "var(--text-main)" }}
          >
            Pomoc
          </Link>
          <Link
            href="/regulations"
            className="hover:underline"
            style={{ color: "var(--text-main)" }}
          >
            Regulamin
          </Link>
          <a
            href="mailto:caseownia@zlecenieserwisowe.pl"
            className="hover:underline"
            style={{ color: "var(--text-main)" }}
          >
            Kontakt
          </a>
        </nav>
        <div
          className="text-sm md:text-right"
          style={{ color: "var(--text-muted)" }}
        >
          &copy; Caseownia, {year}.<br className="hidden md:inline" />{" "}
          Wszelkie prawa zastrzeżone.
        </div>
      </div>
    </footer>
  );
}

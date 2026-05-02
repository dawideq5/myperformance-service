import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-md px-4 md:px-6 py-20 text-center">
      <h1 className="font-display text-5xl font-bold tracking-tight mb-3">
        404
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Strona, której szukasz, nie istnieje.
      </p>
      <Link
        href="/"
        className="inline-flex rounded-lg px-6 py-3 text-base font-medium"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        Wróć na stronę główną
      </Link>
    </section>
  );
}

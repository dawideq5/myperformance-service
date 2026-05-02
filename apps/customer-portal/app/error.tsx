"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-md px-4 md:px-6 py-20 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight mb-3">
        Coś poszło nie tak
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Spróbuj ponownie albo wróć na stronę główną.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg px-6 py-3 text-base font-medium border"
          style={{ borderColor: "var(--border-strong)" }}
        >
          Spróbuj ponownie
        </button>
        <Link
          href="/"
          className="rounded-lg px-6 py-3 text-base font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Strona główna
        </Link>
      </div>
    </section>
  );
}

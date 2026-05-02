import Link from "next/link";
import { ArrowRight, MessageSquare, ShieldCheck, FileText } from "lucide-react";

export const dynamic = "force-static";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero-gradient">
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Naprawa, którą widzisz —{" "}
              <span style={{ color: "var(--text-muted)" }}>
                jak tylko coś się dzieje.
              </span>
            </h1>
            <p
              className="text-base md:text-lg leading-relaxed max-w-xl"
              style={{ color: "var(--text-muted)" }}
            >
              Sprawdź status zlecenia online — bez logowania, bez konta. Tylko
              email i 6-cyfrowy kod.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/status"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-medium transition-colors"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Sprawdź status
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-base font-medium transition-colors hover:bg-bg-muted"
                style={{ borderColor: "var(--border-strong)" }}
              >
                Zaloguj się
              </Link>
            </div>
          </div>
          <div
            className="relative aspect-[3/4] max-w-md mx-auto w-full rounded-3xl overflow-hidden border"
            style={{ borderColor: "var(--border)" }}
            role="img"
            aria-label="Wizualizacja serwisu telefonów — placeholder gradientowy"
          >
            <div className="absolute inset-0 hero-gradient" />
            <div
              className="absolute inset-0 flex items-center justify-center font-display text-7xl"
              style={{ color: "rgba(10,10,10,0.08)" }}
              aria-hidden="true"
            >
              C
            </div>
          </div>
        </div>
      </section>

      {/* Stages */}
      <section className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-8">
            Jak to działa
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { n: "01", t: "Przyjęcie", d: "Zostawiasz urządzenie w punkcie." },
              {
                n: "02",
                t: "Diagnoza",
                d: "Technik sprawdza, co dokładnie nie działa.",
              },
              {
                n: "03",
                t: "Wycena",
                d: "Dostajesz koszty i akceptujesz online.",
              },
              { n: "04", t: "Naprawa", d: "Wymieniamy części, testujemy." },
              {
                n: "05",
                t: "Odbiór",
                d: "Powiadamiamy gdy gotowe — możesz odebrać.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border p-5 transition-colors hover:bg-bg-muted/50"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="font-mono text-xs tracking-widest mb-2"
                  style={{ color: "var(--text-light)" }}
                >
                  {s.n}
                </div>
                <div className="font-display text-lg font-semibold mb-1">
                  {s.t}
                </div>
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {s.d}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section
        className="border-t"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-subtle)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-8">
            Trzy powody, dla których to działa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: ShieldCheck,
                t: "Bez konta",
                d: "Email + 6-cyfrowy kod. Sprawdzasz status w 10 sekund — zero formularzy rejestracji.",
              },
              {
                icon: MessageSquare,
                t: "Live chat",
                d: "Rozmawiasz bezpośrednio z punktem, w którym zostawiłeś urządzenie. Odpowiadamy w godzinach pracy.",
              },
              {
                icon: FileText,
                t: "Dokumenty online",
                d: "Protokół przyjęcia, aneksy, wycena — wszystko w jednym miejscu, do podpisu elektronicznego.",
              },
            ].map(({ icon: Icon, t, d }) => (
              <div
                key={t}
                className="rounded-2xl border bg-white p-6"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-1">{t}</h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

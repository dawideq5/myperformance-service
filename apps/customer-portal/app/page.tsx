import Link from "next/link";
import {
  ArrowRight,
  Activity,
  ShieldCheck,
  MessageCircle,
  PackageOpen,
  Stethoscope,
  Wrench,
  ClipboardCheck,
  PackageCheck,
} from "lucide-react";

export const dynamic = "force-static";

const FEATURES: Array<{
  icon: typeof Activity;
  title: string;
  body: string;
}> = [
  {
    icon: Activity,
    title: "Realny status",
    body: "Sprawdzasz, na jakim etapie jest Twój telefon — przyjęcie, diagnoza, naprawa, testy, odbiór. Bez dzwonienia, bez czekania.",
  },
  {
    icon: ShieldCheck,
    title: "Bezpieczne podpisy",
    body: "Protokoły, aneksy i wyceny podpisujesz elektronicznie w Documenso. Każdy dokument zachowuje znacznik czasu i ślad audytu.",
  },
  {
    icon: MessageCircle,
    title: "Szybka komunikacja",
    body: "Piszesz bezpośrednio do punktu, w którym zostawiłeś urządzenie. Powiadomienia o zmianach lecą e-mailem i SMS-em.",
  },
];

const STEPS: Array<{
  n: string;
  icon: typeof PackageOpen;
  title: string;
  body: string;
}> = [
  {
    n: "01",
    icon: PackageOpen,
    title: "Przyjęcie",
    body: "Zostawiasz urządzenie w punkcie, dostajesz numer zlecenia i protokół.",
  },
  {
    n: "02",
    icon: Stethoscope,
    title: "Diagnoza",
    body: "Technik sprawdza dokładnie, co nie działa i przygotowuje wycenę.",
  },
  {
    n: "03",
    icon: Wrench,
    title: "Naprawa",
    body: "Wymieniamy komponenty na oryginalne lub zatwierdzone zamienniki.",
  },
  {
    n: "04",
    icon: ClipboardCheck,
    title: "Testy",
    body: "Każda naprawa przechodzi pełen cykl testów funkcjonalnych przed zwrotem.",
  },
  {
    n: "05",
    icon: PackageCheck,
    title: "Odbiór",
    body: "Powiadamiamy gdy gotowe — odbierasz osobiście lub wysyłką kurierem.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero-gradient">
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-20 md:py-28 text-center">
          <p
            className="font-mono text-xs tracking-[0.2em] uppercase mb-5"
            style={{ color: "var(--text-light)" }}
          >
            Serwis telefonów by Caseownia
          </p>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl mx-auto">
            Sprawdź status swojego serwisu
          </h1>
          <p
            className="mt-5 text-base md:text-lg leading-relaxed max-w-xl mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Bez konta, bez logowania — wystarczy email i 6-cyfrowy kod, który
            wyślemy w 10 sekund.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
              href="/help"
              className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-base font-medium transition-colors hover:bg-bg-muted"
              style={{
                borderColor: "var(--border-strong)",
                color: "var(--text-main)",
              }}
            >
              Jak to działa
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        className="border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Trzy powody, dla których to działa
            </h2>
            <p
              className="mt-3 text-base"
              style={{ color: "var(--text-muted)" }}
            >
              Prosty proces, czytelne dokumenty i kontakt zawsze pod ręką —
              tak jak powinien wyglądać porządny serwis.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-2xl border p-6 transition-colors hover:bg-bg-muted/30"
                style={{
                  borderColor: "var(--border-subtle)",
                  background: "var(--bg-main)",
                }}
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">
                  {title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Stages */}
      <section
        className="border-t"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--bg-card)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Jak to działa
            </h2>
            <p
              className="mt-3 text-base"
              style={{ color: "var(--text-muted)" }}
            >
              Pięć etapów. Każdy widoczny w czasie rzeczywistym po wpisaniu
              swojego adresu email.
            </p>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map(({ n, icon: Icon, title, body }) => (
              <li
                key={n}
                className="rounded-2xl border p-5 transition-colors"
                style={{
                  borderColor: "var(--border-subtle)",
                  background: "var(--bg-main)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="font-mono text-xs tracking-[0.2em]"
                    style={{ color: "var(--text-light)" }}
                  >
                    {n}
                  </span>
                  <Icon
                    className="h-5 w-5"
                    aria-hidden="true"
                    style={{ color: "var(--accent)" }}
                  />
                </div>
                <div className="font-display text-lg font-semibold mb-1">
                  {title}
                </div>
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {body}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        className="border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 md:py-20 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Gotowy, żeby sprawdzić?
          </h2>
          <p
            className="mt-4 text-base md:text-lg"
            style={{ color: "var(--text-muted)" }}
          >
            Wpisz email użyty przy zostawianiu telefonu — w 10 sekund zobaczysz
            wszystkie swoje zlecenia.
          </p>
          <div className="mt-8">
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
          </div>
        </div>
      </section>
    </>
  );
}

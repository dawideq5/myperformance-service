export const metadata = {
  title: "Pomoc",
};

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Czy potrzebuję konta, żeby sprawdzić status?",
    a: "Nie. Wystarczy email i 6-cyfrowy kod, który wyślemy na ten adres. Konto jest opcjonalne — przyda się, jeśli chcesz mieć stały dostęp do historii.",
  },
  {
    q: "Jak długo ważny jest kod?",
    a: "10 minut. Po tym czasie wpisz email ponownie i poprosimy o nowy kod.",
  },
  {
    q: "Nie dostałem kodu — co zrobić?",
    a: "Sprawdź folder spam i upewnij się, że to ten sam adres, który podałeś przy zostawianiu telefonu. Jeśli nadal go nie ma — zadzwoń do punktu, w którym zostawiłeś urządzenie.",
  },
  {
    q: "Jak długo trwa naprawa?",
    a: "To zależy od usterki. Zwykle diagnoza zajmuje 1–2 dni, naprawa kolejne 1–3 dni. Status w portalu zawsze pokazuje aktualny etap.",
  },
];

export default function HelpPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-20">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
        Pomoc
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--text-muted)" }}>
        Najczęściej zadawane pytania. Jeśli nie znalazłeś odpowiedzi —
        skontaktuj się z punktem, w którym zostawiłeś urządzenie.
      </p>
      <ul className="space-y-3">
        {FAQ.map((item) => (
          <li
            key={item.q}
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 className="font-display text-lg font-semibold mb-1.5">
              {item.q}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {item.a}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

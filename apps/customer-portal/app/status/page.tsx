import { StatusForm } from "./_components/StatusForm";

export const metadata = {
  title: "Sprawdź status zlecenia",
};

export default function StatusPage() {
  return (
    <section className="mx-auto max-w-md px-4 md:px-6 py-12 md:py-20">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
        Sprawdź status zlecenia
      </h1>
      <p
        className="text-sm leading-relaxed mb-8"
        style={{ color: "var(--text-muted)" }}
      >
        Wpisz email użyty przy rejestracji urządzenia. Wyślemy 6-cyfrowy kod
        jednorazowy, ważny przez 10 minut.
      </p>
      <div
        className="rounded-2xl border p-6 md:p-8"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--bg-main)",
          boxShadow: "0 1px 2px rgba(10,10,10,0.04)",
        }}
      >
        <StatusForm />
      </div>
    </section>
  );
}

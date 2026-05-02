export const metadata = {
  title: "Regulamin",
};

export default function RegulationsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-20 prose">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-6">
        Regulamin serwisu
      </h1>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Pełna treść regulaminu serwisu telefonów Caseownia jest dostępna w
        protokole przyjęcia urządzenia oraz na życzenie u obsługi punktu.
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Składając urządzenie do naprawy, klient akceptuje warunki serwisu, w
        tym czas realizacji, kosztorys oraz odpowiedzialność za pozostawione
        akcesoria. Pełen tekst dokumentu jest dostarczany razem z protokołem
        przyjęcia w wersji papierowej oraz PDF.
      </p>
    </section>
  );
}

import { ResultsClient } from "./_components/ResultsClient";

export const metadata = {
  title: "Twoje zlecenia",
};

export default function ResultsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 md:px-6 py-10 md:py-16">
      <ResultsClient />
    </section>
  );
}

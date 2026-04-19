export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <section className="max-w-md w-full bg-slate-800/60 border border-slate-700 rounded-2xl p-10 shadow-xl text-center">
        <h1 className="text-xl font-semibold text-slate-100 mb-3">Brak uprawnień</h1>
        <p className="text-sm text-slate-400">
          Twoje konto nie posiada roli <code className="text-brand-400">serwisant</code>.
          Skontaktuj się z administratorem, jeśli uważasz, że to błąd.
        </p>
      </section>
    </main>
  );
}

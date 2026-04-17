import Link from "next/link";
import { Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex items-center justify-center">
      <div className="w-full max-w-[420px] px-6 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tighter mb-2">MyPerformance</h1>
            <div className="h-1 w-8 bg-indigo-600 mx-auto rounded-full" />
          </div>

          <div className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[2.5rem] p-10 shadow-xl shadow-black/5">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-6">
              <SearchX className="w-8 h-8 text-[var(--accent)]" />
            </div>

            <p className="text-6xl font-black tracking-tighter text-[var(--accent)] mb-4">404</p>
            <h2 className="text-xl font-bold mb-2">Strona nie istnieje</h2>
            <p className="text-sm text-[var(--text-muted)] font-medium mb-8">
              Nie znaleźliśmy strony, której szukasz.
            </p>

            <Link
              href="/dashboard"
              className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              <Home className="w-4 h-4" />
              Wróć na dashboard
            </Link>
          </div>

          <p className="mt-12 text-[10px] uppercase tracking-[0.2em] font-black text-[var(--text-muted)] opacity-50">
            Identity Management
          </p>
        </div>
      </div>
    </div>
  );
}

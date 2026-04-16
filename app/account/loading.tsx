import { Loader2 } from "lucide-react";

export default function AccountLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans">
      <nav className="fixed top-0 w-full z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="w-32 h-6 bg-[var(--border-subtle)] rounded animate-pulse"></div>
          <div className="flex items-center gap-3">
            <div className="w-24 h-10 bg-[var(--border-subtle)] rounded-xl animate-pulse"></div>
          </div>
        </div>
      </nav>

      <main className="pt-24 max-w-2xl mx-auto px-6 pb-24">
        <div className="mb-10">
          <div className="w-48 h-10 bg-[var(--border-subtle)] rounded-lg mb-4 animate-pulse"></div>
          <div className="w-64 h-5 bg-[var(--border-subtle)] rounded animate-pulse"></div>
        </div>

        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/50 flex flex-col gap-4 animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--border-subtle)] rounded-full"></div>
                <div>
                  <div className="w-32 h-5 bg-[var(--border-subtle)] rounded mb-2"></div>
                  <div className="w-48 h-4 bg-[var(--border-subtle)] rounded"></div>
                </div>
              </div>
              <div className="w-full h-10 bg-[var(--border-subtle)] rounded-xl mt-4"></div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

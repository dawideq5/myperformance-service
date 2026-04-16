import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans">
      <nav className="fixed top-0 w-full z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="w-32 h-6 bg-[var(--border-subtle)] rounded animate-pulse"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--border-subtle)] rounded-xl animate-pulse"></div>
            <div className="w-24 h-10 bg-[var(--border-subtle)] rounded-xl animate-pulse"></div>
          </div>
        </div>
      </nav>

      <main className="pt-40 max-w-4xl mx-auto px-6">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-64 h-12 bg-[var(--border-subtle)] rounded-lg mb-16 animate-pulse"></div>

          <div className="p-8 border-2 border-dashed border-[var(--border-subtle)] rounded-[2.5rem] w-full max-w-md h-40 flex flex-col items-center justify-center animate-pulse">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--text-muted)] mb-4" />
            <div className="w-32 h-4 bg-[var(--border-subtle)] rounded"></div>
          </div>
        </div>
      </main>
    </div>
  );
}

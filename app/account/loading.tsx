import { PageShell, Skeleton } from "@/components/ui";

export default function AccountLoading() {
  return (
    <PageShell
      maxWidth="xl"
      header={
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Skeleton className="h-5 w-20" />
              <div className="h-6 w-px bg-[var(--border-subtle)]" />
              <Skeleton className="h-6 w-48" />
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </header>
      }
    >
      <div className="grid lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </aside>
        <section className="lg:col-span-3 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </section>
      </div>
    </PageShell>
  );
}

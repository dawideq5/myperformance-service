import { PageShell, Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <PageShell
      maxWidth="xl"
      header={
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
            <Skeleton className="h-6 w-40" />
            <div className="flex items-center gap-3">
              <Skeleton className="hidden sm:block h-10 w-48" />
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>
        </header>
      }
    >
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

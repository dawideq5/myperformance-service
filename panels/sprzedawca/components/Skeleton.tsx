"use client";

/** Reusable skeleton placeholder. Pulse + neutral background. Używany
 * w listach (ServicesAll, Pricelist, Claims) żeby user widział strukturę
 * podczas pobierania danych zamiast samotnego spinnera. */
export function Skeleton({
  className = "",
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}) {
  const r = {
    sm: "rounded",
    md: "rounded-md",
    lg: "rounded-xl",
    xl: "rounded-2xl",
    full: "rounded-full",
  }[rounded];
  return (
    <div
      className={`animate-pulse bg-white/5 ${r} ${className}`}
      style={{ background: "rgba(148, 163, 184, 0.12)" }}
    />
  );
}

export function ServiceCardSkeleton() {
  return (
    <div
      className="p-3 rounded-2xl border flex gap-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <Skeleton className="w-10 h-10 flex-shrink-0" rounded="lg" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-16" rounded="full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-6 flex-1" rounded="lg" />
          <Skeleton className="h-6 w-12" rounded="lg" />
          <Skeleton className="h-6 w-12" rounded="lg" />
        </div>
      </div>
    </div>
  );
}

export function ServiceListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <ServiceCardSkeleton key={i} />
      ))}
    </div>
  );
}

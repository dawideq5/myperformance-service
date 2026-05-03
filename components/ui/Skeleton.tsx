import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  /** "shimmer" — diagonalny shimmer (default).
   *  "bar"     — chasing pulse-bar w kolorze accentu (np. pod ikoną kafelka).
   *  "pulse"   — klasyczny tailwindowy puls (lekka animacja). */
  variant?: "shimmer" | "bar" | "pulse";
}

export function Skeleton({ className, variant = "shimmer" }: SkeletonProps) {
  if (variant === "bar") {
    return (
      <div
        className={cn("mp-skeleton--bar", className)}
        aria-hidden="true"
      />
    );
  }
  if (variant === "pulse") {
    return (
      <div
        className={cn(
          "bg-[var(--border-subtle)] rounded-lg animate-pulse",
          className,
        )}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className={cn("mp-skeleton", className)}
      aria-hidden="true"
    />
  );
}

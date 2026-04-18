import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
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

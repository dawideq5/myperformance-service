"use client";

import { useEffect, useState } from "react";
import { formatAbsolute, formatRelative } from "@/lib/ui/time";

interface Props {
  /** ISO string albo Date. */
  date: string | Date | null | undefined;
  /** Co ile sekund odświeżać (default 60s). */
  refreshSeconds?: number;
  className?: string;
}

/**
 * Pokazuje "2h temu" + tooltip z pełną datą. Auto-refresh co 60s żeby
 * "przed chwilą" stało się "1 minuta temu" bez full re-render strony.
 */
export function RelativeTime({ date, refreshSeconds = 60, className }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const id = setInterval(
      () => setTick((t) => t + 1),
      refreshSeconds * 1000,
    );
    return () => clearInterval(id);
  }, [date, refreshSeconds]);

  if (!date) return <span className={className}>—</span>;

  return (
    <time
      dateTime={typeof date === "string" ? date : date.toISOString()}
      title={formatAbsolute(date)}
      className={className}
    >
      {formatRelative(date)}
    </time>
  );
}

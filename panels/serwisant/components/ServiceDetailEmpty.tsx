"use client";

import { FileSearch } from "lucide-react";
import { STATUS_META } from "@/lib/serwisant/status-meta";

interface QuickStat {
  status: string;
  count: number;
}

interface ServiceDetailEmptyProps {
  /** Liczniki dla quick stats. Klucz = status. */
  counts?: Record<string, number>;
}

const HIGHLIGHT_STATUSES = ["diagnosing", "repairing", "ready"] as const;

export function ServiceDetailEmpty({ counts }: ServiceDetailEmptyProps) {
  const stats: QuickStat[] = HIGHLIGHT_STATUSES.map((status) => ({
    status,
    count: counts?.[status] ?? 0,
  }));

  return (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[360px] p-8 text-center"
      style={{ color: "var(--text-muted)" }}
    >
      <div
        className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{
          background: "color-mix(in srgb, var(--text-muted) 12%, transparent)",
          color: "var(--text-muted)",
        }}
      >
        <FileSearch className="w-7 h-7" />
      </div>
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: "var(--text-main)" }}
      >
        Wybierz zlecenie z listy
      </h2>
      <p className="text-sm max-w-xs">
        Aby zobaczyć szczegóły urządzenia, klienta i historię działań,
        kliknij dowolne zlecenie po lewej stronie.
      </p>

      {counts && (
        <dl className="mt-8 grid grid-cols-3 gap-3 w-full max-w-md">
          {stats.map((s) => {
            const meta = STATUS_META[s.status as keyof typeof STATUS_META];
            return (
              <div
                key={s.status}
                className="px-3 py-3 rounded-xl border text-center"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <dt
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {meta?.label ?? s.status}
                </dt>
                <dd
                  className="text-xl font-semibold mt-1"
                  style={{ color: "var(--text-main)" }}
                >
                  {s.count}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

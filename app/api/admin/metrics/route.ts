/**
 * /api/admin/metrics — Prometheus exposition format.
 *
 * Eksponuje aktualne podstawowe gauges i counters z runtime'u dashboarda
 * (process metrics, KC poll lag, cache size, queue depth). Wymaga roli
 * `keycloak_admin` lub `infrastructure_admin` — to read-only ale daje wgląd
 * w wewnętrzne stany aplikacji, więc nie powinno być publicznie dostępne.
 *
 * Output format: text/plain; version=0.0.4 — kompatybilny z `prometheus`,
 * `node_exporter` scrape, Grafana Cloud, ...
 *
 * Przyszłe rozszerzenia (Faza 5 finalize):
 *   - OpenTelemetry traces dla `kc-events-poll`, providers, webhook handlers
 *   - Histogram latency request handlers (via middleware hook)
 *   - Job queue depth + retry counts
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  canAccessKeycloakAdmin,
  canAccessInfrastructure,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MetricLine {
  name: string;
  help: string;
  type: "gauge" | "counter";
  value: number;
  labels?: Record<string, string>;
}

function formatMetric(m: MetricLine): string {
  const labels = m.labels
    ? `{${Object.entries(m.labels)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
        .join(",")}}`
    : "";
  return [
    `# HELP ${m.name} ${m.help}`,
    `# TYPE ${m.name} ${m.type}`,
    `${m.name}${labels} ${m.value}`,
  ].join("\n");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!canAccessKeycloakAdmin(session) && !canAccessInfrastructure(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const metrics: MetricLine[] = [];

  // ── Process metrics ────────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  metrics.push({
    name: "process_resident_memory_bytes",
    help: "Resident memory size (RSS) in bytes",
    type: "gauge",
    value: mem.rss,
  });
  metrics.push({
    name: "process_heap_bytes",
    help: "V8 heap size in bytes",
    type: "gauge",
    value: mem.heapUsed,
    labels: { kind: "used" },
  });
  metrics.push({
    name: "process_heap_bytes",
    help: "V8 heap size in bytes",
    type: "gauge",
    value: mem.heapTotal,
    labels: { kind: "total" },
  });
  metrics.push({
    name: "process_uptime_seconds",
    help: "Seconds since process start",
    type: "gauge",
    value: Math.round(process.uptime()),
  });

  // ── App metrics ────────────────────────────────────────────────────────────
  metrics.push({
    name: "myperformance_build_info",
    help: "Build info (always 1, labels carry version)",
    type: "gauge",
    value: 1,
    labels: {
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      node: process.version,
    },
  });

  // ── Cache sizes / poll lag (best-effort — moduły mogą nie eksportować
  //    metricsHook'ów. W Faza 5 finalize dodamy explicit getKcEventsPollState
  //    + getQueueStats; do tego czasu próbujemy via dynamic import + cast). ──
  try {
    const mod = (await import("@/lib/security/kc-events-poll")) as {
      getKcEventsPollState?: () => { cursorMs?: number } | null;
    };
    const state = mod.getKcEventsPollState?.();
    if (state) {
      metrics.push({
        name: "myperformance_kc_events_poll_cursor",
        help: "Latest KC event timestamp processed (epoch ms)",
        type: "gauge",
        value: state.cursorMs ?? 0,
      });
      metrics.push({
        name: "myperformance_kc_events_poll_lag_seconds",
        help: "Approximate lag between latest KC event and current time",
        type: "gauge",
        value: state.cursorMs
          ? Math.max(0, Math.round((Date.now() - state.cursorMs) / 1000))
          : 0,
      });
    }
  } catch {
    // poll module not loaded yet or no state exposed — skip
  }

  try {
    const mod = (await import("@/lib/permissions/queue")) as {
      getQueueStats?: () => Promise<{ pending?: number; failed?: number } | null>;
    };
    const stats = await mod.getQueueStats?.();
    if (stats) {
      metrics.push({
        name: "myperformance_job_queue_depth",
        help: "Pending jobs in permissions queue",
        type: "gauge",
        value: stats.pending ?? 0,
      });
      metrics.push({
        name: "myperformance_job_queue_failed",
        help: "Failed jobs (current snapshot)",
        type: "gauge",
        value: stats.failed ?? 0,
      });
    }
  } catch {
    // queue stats not exposed — skip
  }

  // Render
  const body = metrics.map(formatMetric).join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

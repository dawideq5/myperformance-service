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
import { getKcEventsPollState } from "@/lib/security/kc-events-poll";
import { getQueueStats } from "@/lib/permissions/queue";

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

  // ── KC events poll state ───────────────────────────────────────────────
  // getKcEventsPollState() zwraca null gdy poll nigdy nie wystartował
  // (np. fresh process, instrumentation hook nie zdążył się wywołać).
  const kcPoll = getKcEventsPollState();
  if (kcPoll) {
    metrics.push({
      name: "myperformance_kc_events_poll_cursor",
      help: "Latest KC event timestamp processed (epoch ms)",
      type: "gauge",
      value: kcPoll.cursorMs ?? 0,
    });
    metrics.push({
      name: "myperformance_kc_events_poll_lag_seconds",
      help: "Approximate lag between latest KC event and current time",
      type: "gauge",
      value: kcPoll.cursorMs
        ? Math.max(0, Math.round((Date.now() - kcPoll.cursorMs) / 1000))
        : 0,
    });
    metrics.push({
      name: "myperformance_kc_events_poll_last_count",
      help: "Number of KC events processed in the last poll cycle",
      type: "gauge",
      value: kcPoll.lastEventCount ?? 0,
    });
    metrics.push({
      name: "myperformance_kc_events_poll_errors_total",
      help: "Cumulative KC events poll errors since process start",
      type: "counter",
      value: kcPoll.errorCount ?? 0,
    });
    metrics.push({
      name: "myperformance_kc_events_poll_running",
      help: "1 if a poll cycle is currently in flight, 0 otherwise",
      type: "gauge",
      value: kcPoll.running ? 1 : 0,
    });
  }

  // ── IAM job queue stats ────────────────────────────────────────────────
  // getQueueStats() zwraca null jeśli kolejka jeszcze nie była używana
  // (totalEnqueued=0). Po pierwszym enqueueJob expose pending/running/failed.
  try {
    const stats = await getQueueStats();
    if (stats) {
      metrics.push({
        name: "myperformance_job_queue_depth",
        help: "Pending jobs in permissions queue",
        type: "gauge",
        value: stats.pending,
      });
      metrics.push({
        name: "myperformance_job_queue_running",
        help: "Jobs currently executing (including retry-backoff)",
        type: "gauge",
        value: stats.running,
      });
      metrics.push({
        name: "myperformance_job_queue_failed_total",
        help: "Cumulative failed jobs (retries exhausted) since process start",
        type: "counter",
        value: stats.failed,
      });
      metrics.push({
        name: "myperformance_job_queue_total",
        help: "Cumulative enqueued jobs since process start",
        type: "counter",
        value: stats.total,
      });
    }
  } catch {
    // best-effort — never fail metrics endpoint on queue stats
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

/**
 * OpenTelemetry SDK init dla Next.js dashboard.
 *
 * Auto-instruments:
 *   - fetch (Google Calendar, KC userinfo, Documenso/Outline/Chatwoot/Postal API)
 *   - http (incoming Next.js requests, including all /api routes)
 *   - pg (Documenso DB, dashboard DB)
 *   - mysql2 (Moodle DB)
 *   - dns (resolution latency dla external API)
 *
 * Aktywacja: ustaw `OTEL_EXPORTER_OTLP_ENDPOINT` (np. https://otlp.eu.signoz.cloud
 * lub http://localhost:4318 dla lokalnego Jaeger). Bez tej env zmiennej SDK
 * NIE startuje — fail-closed, brak overhead w prod jeśli operator nie
 * skonfigurował backendu.
 *
 * Service name z `OTEL_SERVICE_NAME` (default: `myperformance-dashboard`).
 *
 * Wywoływane z `instrumentation.ts` przy starcie (node runtime only).
 */

import { log } from "@/lib/logger";

const logger = log.child({ module: "otel-init" });

let sdk: { shutdown: () => Promise<void> } | null = null;

interface OtelInitResult {
  enabled: boolean;
  reason?: string;
}

export async function startOtel(): Promise<OtelInitResult> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return { enabled: false, reason: "OTEL_EXPORTER_OTLP_ENDPOINT not set" };
  }

  if (sdk) {
    return { enabled: true, reason: "already started" };
  }

  try {
    // Lazy imports — żeby ten moduł nie ładował OTel deps gdy fail-closed.
    // Każda zewnętrzna importów to ~30MB bundle; w prod bez OTel nie chcemy.
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-http"
    );
    const { getNodeAutoInstrumentations } = await import(
      "@opentelemetry/auto-instrumentations-node"
    );

    const serviceName =
      process.env.OTEL_SERVICE_NAME?.trim() ?? "myperformance-dashboard";
    const serviceVersion =
      process.env.NEXT_PUBLIC_APP_VERSION?.trim() ?? "unknown";
    const env =
      process.env.OTEL_RESOURCE_ATTRIBUTES_DEPLOYMENT_ENVIRONMENT?.trim() ??
      process.env.NODE_ENV ??
      "production";

    const traceExporter = new OTLPTraceExporter({
      url: endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint}/v1/traces`,
      headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    });

    // Resource attributes ustawiane przez OTEL_RESOURCE_ATTRIBUTES env var
    // (parser SDK auto-merguje z env). Bezpieczniej niż custom Resource ze
    // względu na zmieniające się typy w OTel API między majorami.
    if (!process.env.OTEL_RESOURCE_ATTRIBUTES) {
      process.env.OTEL_RESOURCE_ATTRIBUTES = [
        `service.name=${serviceName}`,
        `service.version=${serviceVersion}`,
        `deployment.environment=${env}`,
      ].join(",");
    }

    const newSdk = new NodeSDK({
      serviceName,
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Wyłączamy fs auto-instr — generuje za dużo span'ów dla Next.js.
          "@opentelemetry/instrumentation-fs": { enabled: false },
          // DNS jest noisy ale wartościowy dla diagnozy slow integrations.
          "@opentelemetry/instrumentation-dns": { enabled: true },
        }),
      ],
    });

    newSdk.start();
    sdk = newSdk;
    logger.info("otel sdk started", { serviceName, endpoint, env });

    // Graceful shutdown — flush pending spans przy SIGTERM.
    const shutdown = async (): Promise<void> => {
      if (!sdk) return;
      try {
        await sdk.shutdown();
        logger.info("otel sdk shut down cleanly");
      } catch (err) {
        logger.warn("otel sdk shutdown error", {
          err: err instanceof Error ? err.message : String(err),
        });
      } finally {
        sdk = null;
      }
    };
    process.once("SIGTERM", () => void shutdown());
    process.once("SIGINT", () => void shutdown());

    return { enabled: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("otel sdk init failed", { reason });
    return { enabled: false, reason };
  }
}

function parseHeaders(input?: string): Record<string, string> | undefined {
  if (!input) return undefined;
  // Format: `Authorization=Bearer xxx,X-Tenant=foo`
  const out: Record<string, string> = {};
  for (const pair of input.split(",")) {
    const [k, ...rest] = pair.split("=");
    const key = k?.trim();
    const value = rest.join("=").trim();
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Czysto narzędziowe — sprawdza czy OTel jest aktywne (zwraca true gdy SDK
 * jest startowany). Używane przez `/api/admin/metrics` żeby dodać label
 * `otel_enabled` do gauges.
 */
export function isOtelEnabled(): boolean {
  return sdk !== null;
}

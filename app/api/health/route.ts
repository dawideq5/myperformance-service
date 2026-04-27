import { NextResponse, type NextRequest } from "next/server";
import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 4_000;

type CheckStatus = "ok" | "unreachable" | "error";

async function checkKeycloak(): Promise<{ status: CheckStatus; latencyMs: number; detail?: string }> {
  const startedAt = Date.now();
  try {
    const issuer = keycloak.getIssuer();
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    return {
      status: res.ok ? "ok" : "unreachable",
      latencyMs: Date.now() - startedAt,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * GET /api/health
 *
 * - Default (no query): fast liveness. Returns 200 as long as the process
 *   accepts requests. Safe for Docker HEALTHCHECK — does not fan out to
 *   upstreams, so a transient Keycloak blip won't trigger container
 *   restarts cascading the outage.
 *
 * - With `?deep=1`: readiness. Hits Keycloak's OIDC discovery endpoint to
 *   prove the auth provider is actually reachable. Returns 503 when an
 *   upstream is down. Intended for Traefik / load balancer readiness probes
 *   or scripted smoke tests.
 */
export async function GET(request: NextRequest) {
  const deep = request.nextUrl.searchParams.get("deep") === "1";
  // Wycinamy version i internal details — `/api/health` jest publiczny
  // (Docker HEALTHCHECK + Traefik probe). Atakujący NIE potrzebują znać
  // dokładnej wersji apki do footprintingu. Status + timestamp wystarczy
  // do live-/readinesss checków.
  const base = {
    status: "ok" as const,
    timestamp: new Date().toISOString(),
  };

  if (!deep) {
    return NextResponse.json(base);
  }

  const keycloakCheck = await checkKeycloak();
  const checks = { keycloak: keycloakCheck };
  const healthy = keycloakCheck.status === "ok";

  if (!healthy) {
    log.warn("health probe degraded", { checks });
  }

  // Deep mode: detail tylko status, bez `latencyMs` ani `detail` które mogą
  // ujawniać upstream errory (KC version, timeouty itd.). Pełny detail
  // dostępny w server logs przez log.warn.
  return NextResponse.json(
    {
      ...base,
      status: healthy ? "ok" : "degraded",
      checks: {
        keycloak: { status: keycloakCheck.status },
      },
    },
    { status: healthy ? 200 : 503 },
  );
}

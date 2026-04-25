import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  extractCertSerial,
  extractFingerprintComponents,
} from "@/lib/device-fingerprint";

const REQUIRED_ROLE = "serwisant";
const GATE_URL = process.env.CERT_GATE_URL ?? "";
const GATE_SECRET = process.env.CERT_GATE_SECRET ?? "";
const GATE_DEBUG = process.env.CERT_GATE_DEBUG === "1";

const MAINTENANCE_STATUS_URL =
  process.env.MAINTENANCE_STATUS_URL ??
  "https://myperformance.pl/api/maintenance/status";
const MAINTENANCE_REDIRECT_URL =
  process.env.MAINTENANCE_REDIRECT_URL ?? "https://myperformance.pl/maintenance";
const MAINTENANCE_TTL_MS = 30_000;
let maintenanceCache: { active: boolean; checkedAt: number } | null = null;

async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.checkedAt < MAINTENANCE_TTL_MS) {
    return maintenanceCache.active;
  }
  try {
    const res = await fetch(MAINTENANCE_STATUS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) {
      maintenanceCache = { active: false, checkedAt: now };
      return false;
    }
    const data = (await res.json()) as { enabled?: boolean };
    const active = !!data.enabled;
    maintenanceCache = { active, checkedAt: now };
    return active;
  } catch {
    // Fail-open: gdy central down nie chcemy zablokować całego panela.
    maintenanceCache = { active: false, checkedAt: now };
    return false;
  }
}

function canBypassMaintenance(roles: string[]): boolean {
  return (
    roles.includes("admin") ||
    roles.includes("realm-admin") ||
    roles.includes("manage-realm") ||
    roles.includes("maintenance_bypass")
  );
}


async function verifyDeviceBinding(req: Request): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!GATE_URL || !GATE_SECRET) return { ok: true };
  const serial = extractCertSerial(req.headers);
  if (GATE_DEBUG) {
    const info = req.headers.get("x-forwarded-tls-client-cert-info");
    const pem = req.headers.get("x-forwarded-tls-client-cert");
    console.log(
      JSON.stringify({
        gate: "serwisant",
        path: new URL(req.url).pathname,
        hasInfo: !!info,
        infoSample: info?.slice(0, 200),
        hasPem: !!pem,
        pemLen: pem?.length ?? 0,
        serial,
      }),
    );
  }
  if (!serial) return { ok: true };
  const components = extractFingerprintComponents(req.headers);
  try {
    const res = await fetch(GATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cert-gate-secret": GATE_SECRET,
      },
      body: JSON.stringify({
        serial,
        components,
        ip:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      }),
    });
    if (GATE_DEBUG) {
      console.log(
        JSON.stringify({ gate: "serwisant", step: "response", status: res.status }),
      );
    }
    if (res.ok) return { ok: true };
    if (res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { reason?: string };
      return {
        ok: false,
        reason: data.reason ?? "Urządzenie zmieniło konfigurację.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (GATE_DEBUG) {
      console.error(
        JSON.stringify({
          gate: "serwisant",
          step: "fetch-error",
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    return { ok: true };
  }
}

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token as { accessToken?: string; roles?: string[] } | null;
    if (!token?.accessToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const roles = token.roles ?? [];
    // Maintenance gate — central status; bypass dla maintenance_bypass/admin.
    if (await isMaintenanceMode()) {
      if (!canBypassMaintenance(roles)) {
        return NextResponse.redirect(MAINTENANCE_REDIRECT_URL);
      }
    }
    if (!roles.includes(REQUIRED_ROLE) && !roles.includes("admin")) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }
    if (process.env.MTLS_REQUIRED === "true") {
      const serial = extractCertSerial(req.headers);
      if (!serial) {
        return NextResponse.redirect(new URL("/forbidden/no-cert", req.url));
      }
    }
    const gate = await verifyDeviceBinding(req);
    if (!gate.ok) {
      const url = new URL("/forbidden/device", req.url);
      if (gate.reason) url.searchParams.set("reason", gate.reason);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: () => true },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: ["/((?!login|forbidden|api/auth|api/health|_next|favicon.ico).*)"],
};

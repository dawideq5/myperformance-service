import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  extractCertSerial,
  extractFingerprintComponents,
} from "@/lib/device-fingerprint";

const REQUIRED_ROLE = "sprzedawca";
const GATE_URL = process.env.CERT_GATE_URL ?? "";
const GATE_SECRET = process.env.CERT_GATE_SECRET ?? "";
const GATE_DEBUG = process.env.CERT_GATE_DEBUG === "1";


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
        gate: "sprzedawca",
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
        JSON.stringify({ gate: "sprzedawca", step: "response", status: res.status }),
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
          gate: "sprzedawca",
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
    if (GATE_DEBUG) {
      const info = req.headers.get("x-forwarded-tls-client-cert-info");
      const pem = req.headers.get("x-forwarded-tls-client-cert");
      console.log(
        JSON.stringify({
          gate: "sprzedawca",
          phase: "pre-auth",
          path: new URL(req.url).pathname,
          hasInfo: !!info,
          infoLen: info?.length ?? 0,
          infoSample: info?.slice(0, 300),
          hasPem: !!pem,
          pemLen: pem?.length ?? 0,
        }),
      );
    }
    const devBypass =
      process.env.NODE_ENV === "development" &&
      process.env.DEV_CERT_BYPASS === "true";

    if (devBypass) return NextResponse.next();

    const token = req.nextauth.token as { accessToken?: string; roles?: string[] } | null;
    if (!token?.accessToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const roles = token.roles ?? [];
    if (!roles.includes(REQUIRED_ROLE) && !roles.includes("admin")) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }
    // mTLS hard-require gdy MTLS_REQUIRED=true (toggle z dashboard).
    // Production: Traefik rejects the connection before this code runs
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

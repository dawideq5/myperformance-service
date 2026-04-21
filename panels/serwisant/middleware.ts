import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  extractCertSerial,
  extractFingerprintComponents,
} from "@/lib/device-fingerprint";

const REQUIRED_ROLE = "serwisant";
const GATE_URL = process.env.CERT_GATE_URL ?? "";
const GATE_SECRET = process.env.CERT_GATE_SECRET ?? "";

async function verifyDeviceBinding(req: Request): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!GATE_URL || !GATE_SECRET) return { ok: true };
  const serial = extractCertSerial(req.headers);
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
    if (res.ok) return { ok: true };
    if (res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { reason?: string };
      return {
        ok: false,
        reason: data.reason ?? "Urządzenie zmieniło konfigurację.",
      };
    }
    return { ok: true };
  } catch {
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
    if (!roles.includes(REQUIRED_ROLE) && !roles.includes("admin")) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
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

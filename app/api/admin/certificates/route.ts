import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { issueClientCertificate, listCertificates } from "@/lib/step-ca";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const certificates = await listCertificates();
  return NextResponse.json({ certificates });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { commonName, email, role } = body ?? {};
  if (typeof commonName !== "string" || typeof email !== "string" || typeof role !== "string") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!["sprzedawca", "serwisant", "kierowca", "dokumenty_access"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    const { pkcs12, pkcs12Password, meta } = await issueClientCertificate({ commonName, email, role: role as any });
    return new NextResponse(new Uint8Array(pkcs12), {
      status: 200,
      headers: {
        "Content-Type": "application/x-pkcs12",
        "Content-Disposition": `attachment; filename="${commonName.replace(/[^a-zA-Z0-9_-]+/g, "_")}.p12"`,
        "X-Pkcs12-Password": pkcs12Password,
        "X-Cert-Serial": meta.serialNumber,
        "X-Cert-Not-After": meta.notAfter,
        "Access-Control-Expose-Headers": "X-Pkcs12-Password, X-Cert-Serial, X-Cert-Not-After",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Issue failed" },
      { status: 503 }
    );
  }
}

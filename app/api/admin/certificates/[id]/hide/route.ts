import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { findCertificateBySerial, hideCertificate } from "@/lib/persistence";
import { auditLog } from "@/lib/step-ca";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageCertificates(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const cert = await findCertificateBySerial(id);
  if (!cert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!cert.revokedAt) {
    return NextResponse.json(
      { error: "Only revoked certificates can be hidden" },
      { status: 400 },
    );
  }
  await hideCertificate(cert.id);
  const actor = session.user?.email ?? "unknown-admin";
  auditLog({
    ts: new Date().toISOString(),
    actor,
    action: "hide-cert",
    subject: cert.id,
    ok: true,
  });
  return NextResponse.json({ hidden: true });
}

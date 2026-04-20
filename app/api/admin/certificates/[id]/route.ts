import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { auditLog, revokeCertificate } from "@/lib/step-ca";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const actor = session.user?.email ?? "unknown-admin";
  try {
    await revokeCertificate(id, "revoked-by-admin");
    auditLog({ ts: new Date().toISOString(), actor, action: "revoke-cert", subject: id, ok: true });
    return NextResponse.json({ revoked: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Revoke failed";
    auditLog({ ts: new Date().toISOString(), actor, action: "revoke-cert", subject: id, ok: false, error: msg });
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

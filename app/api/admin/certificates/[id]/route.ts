import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { auditLog, revokeCertificate } from "@/lib/step-ca";
import { sendCertificateRevokedEmail } from "@/lib/cert-delivery";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCertificates(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const actor = session.user?.email ?? "unknown-admin";
  try {
    const revoked = await revokeCertificate(id, "revoked-by-admin");
    auditLog({ ts: new Date().toISOString(), actor, action: "revoke-cert", subject: id, ok: true });

    let emailSent = false;
    let emailError: string | undefined;
    if (revoked?.email) {
      try {
        await sendCertificateRevokedEmail({
          email: revoked.email,
          commonName: revoked.subject,
          roles: revoked.roles ?? revoked.role.split(","),
          revokedAtIso: revoked.revokedAt ?? new Date().toISOString(),
          reason: "unieważnienie przez administratora",
        });
        emailSent = true;
        auditLog({ ts: new Date().toISOString(), actor, action: "email-revoke", subject: revoked.email, ok: true });
      } catch (err) {
        emailError = err instanceof Error ? err.message : "email send failed";
        auditLog({ ts: new Date().toISOString(), actor, action: "email-revoke", subject: revoked.email, ok: false, error: emailError });
      }
    }

    return NextResponse.json({ revoked: true, emailSent, emailError });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Revoke failed";
    auditLog({ ts: new Date().toISOString(), actor, action: "revoke-cert", subject: id, ok: false, error: msg });
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

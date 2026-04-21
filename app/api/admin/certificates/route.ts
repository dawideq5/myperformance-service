import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { auditLog, issueClientCertificate, listCertificates, recordCertificate } from "@/lib/step-ca";
import { sendCertificateByEmail } from "@/lib/cert-delivery";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { canManageCertificates } from "@/lib/admin-auth";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  if (!canManageCertificates(session)) return { ok: false as const, status: 403 };
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

  const rl = rateLimit(`cert-issue:${getClientIp(req)}`, { capacity: 5, refillPerSec: 5 / 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Przekroczono limit wystawiania (5/min). Spróbuj ponownie za chwilę." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { commonName, email } = body ?? {};
  const rawRoles: string[] = Array.isArray(body?.roles)
    ? body.roles
    : typeof body?.role === "string"
      ? [body.role]
      : [];
  if (typeof commonName !== "string" || typeof email !== "string" || rawRoles.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const allowed = ["sprzedawca", "serwisant", "kierowca"] as const;
  const roles = Array.from(new Set(rawRoles));
  if (roles.some((r) => !allowed.includes(r as (typeof allowed)[number]))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const validityDaysRaw = body?.validityDays;
  const validityDays = Number.isFinite(validityDaysRaw) ? Math.floor(Number(validityDaysRaw)) : 365;
  if (validityDays < 1 || validityDays > 3650) {
    return NextResponse.json({ error: "validityDays must be between 1 and 3650" }, { status: 400 });
  }

  const actor = (await getServerSession(authOptions))?.user?.email ?? "unknown-admin";
  const subjectLabel = `${commonName} (${roles.join(",")})`;
  const filename = `${commonName.replace(/[^a-zA-Z0-9_-]+/g, "_")}.p12`;
  try {
    const { pkcs12, pkcs12Password, meta } = await issueClientCertificate({
      commonName,
      email,
      roles: roles as Parameters<typeof issueClientCertificate>[0]["roles"],
      ttlDays: validityDays,
    });
    await recordCertificate(meta);
    auditLog({ ts: new Date().toISOString(), actor, action: "issue-cert", subject: subjectLabel, ok: true });

    let emailSent = false;
    let emailError: string | undefined;
    try {
      await sendCertificateByEmail({
        email,
        commonName,
        roles,
        notAfterIso: meta.notAfter,
        password: pkcs12Password,
        p12: pkcs12,
        filename,
      });
      emailSent = true;
      auditLog({ ts: new Date().toISOString(), actor, action: "email-cert", subject: `${email}`, ok: true });
    } catch (err) {
      emailError = err instanceof Error ? err.message : "email send failed";
      auditLog({ ts: new Date().toISOString(), actor, action: "email-cert", subject: `${email}`, ok: false, error: emailError });
    }

    // Always return the .p12 + password so the admin can hand it over
    // manually even when email delivery succeeded (or apparently did).
    return NextResponse.json({
      ok: true,
      sent: emailSent,
      emailError,
      meta,
      password: pkcs12Password,
      pkcs12Base64: Buffer.from(pkcs12).toString("base64"),
      filename,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Issue failed";
    auditLog({ ts: new Date().toISOString(), actor, action: "issue-cert", subject: subjectLabel, ok: false, error: msg });
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

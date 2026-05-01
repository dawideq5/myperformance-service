import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { auditLog, issueClientCertificate, listCertificates, recordCertificate } from "@/lib/step-ca";
import { sendCertificateByEmail } from "@/lib/cert-delivery";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
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

  interface IssueCertBody {
    /** Nowy model — nazwa urządzenia/komputera jako CN. */
    deviceName?: string;
    /** Stary model — nadal akceptowany jako alias dla deviceName (backward compat). */
    commonName?: string;
    /** E-mail kontaktowy do dostarczenia .p12 — opcjonalne; nie jest identyfikatorem osoby. */
    email?: string;
    /** UUID lokalizacji przypisywanej przy wystawieniu — opcjonalne. */
    locationId?: string;
    /** Opis stanowiska/urządzenia — opcjonalne. */
    description?: string;
    role?: string;
    roles?: string[];
    validityDays?: number;
  }
  let body: IssueCertBody | null;
  try {
    body = (await req.json()) as IssueCertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // deviceName jest nowym polem CN; commonName zachowane dla backward compat.
  const deviceName = body?.deviceName ?? body?.commonName;
  const email = body?.email ?? "";
  const locationId = body?.locationId;
  const description = body?.description;

  const rawRoles: string[] = Array.isArray(body?.roles)
    ? body.roles
    : typeof body?.role === "string"
      ? [body.role]
      : [];
  if (typeof deviceName !== "string" || !deviceName.trim() || rawRoles.length === 0) {
    return NextResponse.json(
      { error: "Pole deviceName (nazwa urządzenia) oraz co najmniej jedna rola są wymagane." },
      { status: 400 },
    );
  }
  const commonName = deviceName.trim();
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

  // step-ca wymaga niepustego email SAN — używamy placeholder jeśli admin nie podał adresu.
  const emailSan = email.trim() || `device-${commonName.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}@myperformance.internal`;

  const actor = (await getServerSession(authOptions))?.user?.email ?? "unknown-admin";
  const subjectLabel = `${commonName} (${roles.join(",")})`;
  const filename = `${commonName.replace(/[^a-zA-Z0-9_-]+/g, "_")}.p12`;
  try {
    const { pkcs12, pkcs12Password, meta } = await issueClientCertificate({
      commonName,
      email: emailSan,
      roles: roles as Parameters<typeof issueClientCertificate>[0]["roles"],
      ttlDays: validityDays,
    });

    // Dołącz pola urządzenia do meta przed zapisem.
    const enrichedMeta = {
      ...meta,
      email: email.trim() || meta.email,
      ...(locationId ? { locationId } : {}),
      ...(description ? { description } : {}),
    };

    await recordCertificate(enrichedMeta);
    auditLog({ ts: new Date().toISOString(), actor, action: "issue-cert", subject: subjectLabel, ok: true });

    let emailSent = false;
    let emailError: string | undefined;
    if (email.trim()) {
      try {
        await sendCertificateByEmail({
          email: email.trim(),
          commonName,
          roles,
          notAfterIso: enrichedMeta.notAfter,
          password: pkcs12Password,
          p12: pkcs12,
          filename,
        });
        emailSent = true;
        auditLog({ ts: new Date().toISOString(), actor, action: "email-cert", subject: email.trim(), ok: true });
        void getUserIdByEmail(email.trim()).then((uid) => {
          if (uid) {
            void notifyUser(uid, "account.cert.issued", {
              title: "Wystawiono certyfikat urządzenia",
              body: `Certyfikat dla urządzenia ${commonName} (role: ${roles.join(", ")}) został wystawiony i wysłany na ${email}. Ważny do ${enrichedMeta.notAfter}.`,
              severity: "success",
              payload: { commonName, roles, notAfter: enrichedMeta.notAfter },
            });
          }
        });
      } catch (err) {
        emailError = err instanceof Error ? err.message : "email send failed";
        auditLog({ ts: new Date().toISOString(), actor, action: "email-cert", subject: email.trim(), ok: false, error: emailError });
      }
    }

    // Zawsze zwróć .p12 + hasło — admin może przekazać je ręcznie.
    return NextResponse.json({
      ok: true,
      sent: emailSent,
      emailError,
      meta: enrichedMeta,
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

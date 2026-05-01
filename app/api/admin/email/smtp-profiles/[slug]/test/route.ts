export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { getSmtpProfile } from "@/lib/email/db/smtp-profiles";
import { sendMail } from "@/lib/smtp";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ slug: string }>;
}

interface TestPayload {
  to: string;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { slug } = await params;
    const profile = await getSmtpProfile(slug);
    if (!profile) throw ApiError.notFound("SMTP profile not found");
    const body = (await req.json().catch(() => null)) as TestPayload | null;
    if (!body?.to) throw ApiError.badRequest("`to` required");

    const subject = `Test SMTP profilu ${profile.name}`;
    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f4f5;padding:24px;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
  <h2 style="margin:0 0 16px;color:#0c0c0e">Test SMTP profilu</h2>
  <p style="color:#444;margin:0 0 16px">Wiadomość testowa wysłana z dashboardu MyPerformance.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;color:#444">
    <tr><td style="padding:6px 0;color:#888;width:140px">Profile slug</td><td style="padding:6px 0;font-family:monospace">${profile.slug}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Profile name</td><td style="padding:6px 0">${profile.name}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Host</td><td style="padding:6px 0;font-family:monospace">${profile.host}:${profile.port}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Secure (TLS)</td><td style="padding:6px 0">${profile.secure ? "tak" : "nie"}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Username</td><td style="padding:6px 0;font-family:monospace">${profile.username}</td></tr>
    <tr><td style="padding:6px 0;color:#888">From</td><td style="padding:6px 0;font-family:monospace">${profile.fromAddress}</td></tr>
  </table>
  <p style="margin:24px 0 0;color:#888;font-size:12px">Jeśli ta wiadomość dotarła — profil działa i można go używać dla rzeczywistych szablonów.</p>
</div>
</body></html>`;
    const text = `Test SMTP profilu — ${profile.name} (${profile.slug})\n\nHost: ${profile.host}:${profile.port}\nFrom: ${profile.fromAddress}\n\nJeśli ta wiadomość dotarła, profil działa.`;

    try {
      const r = await sendMail({
        to: body.to,
        subject,
        html,
        text,
        profileSlug: slug,
      });
      return createSuccessResponse({ ok: true, messageId: r.messageId });
    } catch (err) {
      return createSuccessResponse({
        ok: false,
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

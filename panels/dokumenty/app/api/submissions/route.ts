import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createSubmission, listSubmissions } from "@/lib/docuseal";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const submissions = await listSubmissions();
  return NextResponse.json({ submissions });
}

export async function POST(req: Request) {
  const auth = await requireAccess();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { templateId, recipients, subject, message, order, expiresAt } = body ?? {};
  if (!templateId || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "Brak szablonu lub odbiorców" }, { status: 400 });
  }

  const submitters = recipients
    .map((r: unknown) => {
      if (typeof r === "string") return { email: r.trim() };
      if (r && typeof r === "object") {
        const obj = r as { email?: string; name?: string; role?: string };
        return obj.email ? { email: obj.email.trim(), name: obj.name, role: obj.role } : null;
      }
      return null;
    })
    .filter((x): x is { email: string; name?: string; role?: string } => !!x?.email);

  if (submitters.length === 0) {
    return NextResponse.json({ error: "Brak prawidłowych odbiorców" }, { status: 400 });
  }

  try {
    const result = await createSubmission({
      templateId: Number(templateId),
      submitters,
      sendEmail: true,
      subject,
      message,
      order,
      expiresAt,
    });
    broadcast({
      type: "submission.created",
      submissionId: result.id,
      at: new Date().toISOString(),
      data: { name: result.name, recipients: submitters.map((s) => s.email) },
    });
    return NextResponse.json({ ok: true, submission: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submit failed" },
      { status: 503 },
    );
  }
}

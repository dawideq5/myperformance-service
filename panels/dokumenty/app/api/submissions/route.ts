import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createSubmission } from "@/lib/docuseal";

export const runtime = "nodejs";

async function requireAccess() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const };
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
  const { templateId, recipients } = body ?? {};
  if (!templateId || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "Brak szablonu lub odbiorców" }, { status: 400 });
  }

  try {
    const result = await createSubmission({
      templateId: Number(templateId),
      submitters: recipients.map((email: string) => ({ email })),
      sendEmail: true,
    });
    return NextResponse.json({ ok: true, submitters: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submit failed" },
      { status: 503 }
    );
  }
}

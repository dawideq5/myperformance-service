import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { uploadPdfTemplate } from "@/lib/docuseal";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const { name, pdfBase64 } = body ?? {};
  if (typeof name !== "string" || typeof pdfBase64 !== "string") {
    return NextResponse.json({ error: "Brak wymaganych pól" }, { status: 400 });
  }

  try {
    const result = await uploadPdfTemplate({ name, pdfBase64 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 503 }
    );
  }
}

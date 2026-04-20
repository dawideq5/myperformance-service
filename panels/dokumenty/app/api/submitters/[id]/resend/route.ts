import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { resendSubmitter } from "@/lib/documenso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    await resendSubmitter(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resend failed" },
      { status: 503 },
    );
  }
}

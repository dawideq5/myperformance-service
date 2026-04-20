import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { archiveSubmission, getSubmission } from "@/lib/docuseal";
import { broadcast } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("dokumenty_access") && !roles.includes("admin")) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const submission = await getSubmission(id);
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ submission });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    await archiveSubmission(id);
    broadcast({ type: "state.refresh", submissionId: id, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { archiveTemplate, cloneTemplate } from "@/lib/documenso";
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
    await archiveTemplate(id);
    broadcast({ type: "state.refresh", templateId: id, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Archive failed" },
      { status: 503 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  try {
    const result = await cloneTemplate(id, body?.name);
    broadcast({
      type: "template.created",
      templateId: result.id,
      at: new Date().toISOString(),
      data: { clonedFrom: id },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Clone failed" },
      { status: 503 },
    );
  }
}

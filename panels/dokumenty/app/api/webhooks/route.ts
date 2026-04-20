import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { deleteWebhook, listWebhooks, upsertWebhook } from "@/lib/documenso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  const roles = ((session.user as { roles?: string[] } | undefined)?.roles ?? []) as string[];
  if (!roles.includes("admin")) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

export async function GET() {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const webhooks = await listWebhooks();
  return NextResponse.json({
    webhooks,
    recommendedUrl: "(DEPLOY_URL)/api/webhooks/documenso",
    secretConfigured: !!process.env.DOCUMENSO_WEBHOOK_SECRET,
  });
}

export async function POST(req: Request) {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { id, url, events } = body ?? {};
  if (typeof url !== "string" || !Array.isArray(events)) {
    return NextResponse.json({ error: "url and events required" }, { status: 400 });
  }
  try {
    const result = await upsertWebhook({ id, url, events });
    return NextResponse.json({ webhook: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook upsert failed" },
      { status: 503 },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await guard();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteWebhook(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook delete failed" },
      { status: 503 },
    );
  }
}

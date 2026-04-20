import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getSubmissionDocuments, proxyFetch } from "@/lib/documenso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const which = url.searchParams.get("which") ?? "first";

  const docs = await getSubmissionDocuments(id);
  if (docs.length === 0) return NextResponse.json({ error: "No documents" }, { status: 404 });
  const doc = which === "all" ? docs[0] : docs[0];
  try {
    const upstream = await proxyFetch(doc.url);
    if (!upstream.ok) return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/pdf");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.name)}"`,
    );
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 503 },
    );
  }
}

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import {
  getSubmissionDocuments,
  listSubmissionsForEmail,
  proxyDocusealFetch,
} from "@/lib/docuseal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const docs = await listSubmissionsForEmail(session.user.email);
  const allowed = docs.some((d) => d.submissionId === id || d.id === id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const files = await getSubmissionDocuments(id);
  if (files.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = files[0];
  try {
    const upstream = await proxyDocusealFetch(file.url);
    if (!upstream.ok) return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/pdf");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.name)}"`,
    );
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 503 },
    );
  }
}

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { downloadDocumentPdf, listDocumentsForEmail } from "@/lib/documenso";

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

  const docs = await listDocumentsForEmail(session.user.email);
  const doc = docs.find((d) => d.id === id);
  if (!doc) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (doc.status !== "completed") {
    return NextResponse.json({ error: "Dokument nie został jeszcze podpisany" }, { status: 409 });
  }

  try {
    const upstream = await downloadDocumentPdf(id);
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/pdf");
    const safeName = (doc.name || "dokument").replace(/[^\w\- ąęłńóśźżĄĘŁŃÓŚŹŻ]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeName)}.pdf"`,
    );
    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 503 },
    );
  }
}

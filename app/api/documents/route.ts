import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { computeDocumensoStats, listDocumentsForEmail } from "@/lib/documenso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await listDocumentsForEmail(session.user.email);
  const stats = computeDocumensoStats(documents);

  return NextResponse.json({ documents, stats });
}

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { computeDocumentStats, listSubmissionsForEmail } from "@/lib/docuseal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await listSubmissionsForEmail(session.user.email);
  const stats = computeDocumentStats(documents);

  return NextResponse.json({ documents, stats });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getRootCaPem } from "@/lib/step-ca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const pem = await getRootCaPem();
    return new NextResponse(pem, {
      status: 200,
      headers: {
        "Content-Type": "application/x-pem-file",
        "Content-Disposition": `attachment; filename="myperformance-root-ca.pem"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fetch failed" }, { status: 503 });
  }
}

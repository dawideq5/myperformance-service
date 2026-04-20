import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { provisionSsoLoginUrl } from "@/lib/chatwoot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = session.user.email;
  const name = session.user.name || email;
  try {
    const url = await provisionSsoLoginUrl(email, name);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chatwoot SSO failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

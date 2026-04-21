import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { provisionSsoLoginUrl, type ChatwootRole } from "@/lib/chatwoot";
import { canAccessChatwootAsAdmin, canAccessChatwootAsAgent } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = (req.nextUrl.searchParams.get("role") ?? "").toLowerCase();
  const hasAdmin = canAccessChatwootAsAdmin(session);
  const hasAgent = canAccessChatwootAsAgent(session);

  let role: ChatwootRole;
  if (requested === "admin" || requested === "administrator") {
    if (!hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    role = "administrator";
  } else if (requested === "agent") {
    if (!hasAgent && !hasAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    role = "agent";
  } else {
    if (hasAdmin) role = "administrator";
    else if (hasAgent) role = "agent";
    else return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = session.user.email;
  const name = session.user.name || email;
  try {
    const url = await provisionSsoLoginUrl(email, name, role);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chatwoot SSO failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

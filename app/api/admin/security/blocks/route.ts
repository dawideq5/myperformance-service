export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireSecurity } from "@/lib/admin-auth";
import { listBlockedIps, blockIp, unblockIp } from "@/lib/security/db";
import { recordEvent } from "@/lib/security/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSecurity(session);
    const blocks = await listBlockedIps();
    return createSuccessResponse({ blocks });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  ip: string;
  reason: string;
  durationMinutes?: number;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSecurity(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.ip || !body?.reason) {
      throw ApiError.badRequest("ip + reason required");
    }
    const actor = session.user?.email ?? "admin";
    const block = await blockIp({
      ip: body.ip,
      reason: body.reason,
      blockedBy: actor,
      source: "manual",
      durationMinutes: body.durationMinutes,
    });
    await recordEvent({
      severity: "medium",
      category: "block.manual",
      source: "dashboard",
      title: `IP zablokowane manualnie: ${body.ip}`,
      description: body.reason,
      srcIp: body.ip,
      details: { blockedBy: actor, duration: body.durationMinutes ?? "permanent" },
    });
    return createSuccessResponse({ block });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSecurity(session);
    const url = new URL(req.url);
    const ip = url.searchParams.get("ip");
    if (!ip) throw ApiError.badRequest("ip required");
    await unblockIp(ip);
    await recordEvent({
      severity: "info",
      category: "block.unblock",
      source: "dashboard",
      title: `IP odblokowane: ${ip}`,
      srcIp: ip,
      details: { unblockedBy: session.user?.email ?? "admin" },
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

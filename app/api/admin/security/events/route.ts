export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireSecurity } from "@/lib/admin-auth";
import { listEvents, recordEvent, type Severity } from "@/lib/security/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSecurity(session);
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const severity = url.searchParams.get("severity") as Severity | null;
    const category = url.searchParams.get("category");
    const srcIp = url.searchParams.get("srcIp");

    const events = await listEvents({
      limit,
      offset,
      severity: severity ?? undefined,
      category: category ?? undefined,
      srcIp: srcIp ?? undefined,
    });
    return createSuccessResponse({ events });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  severity: Severity;
  category: string;
  source: string;
  title: string;
  description?: string;
  srcIp?: string;
  targetUser?: string;
  details?: Record<string, unknown>;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSecurity(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.severity || !body?.category || !body?.title || !body?.source) {
      throw ApiError.badRequest("severity + category + source + title required");
    }
    await recordEvent(body);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { listIamAudit, type IamAuditEntry } from "@/lib/permissions/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
    const targetType = url.searchParams.get("targetType") as
      | IamAuditEntry["targetType"]
      | null;
    const targetId = url.searchParams.get("targetId") ?? undefined;
    const entries = await listIamAudit({
      limit,
      targetType: targetType ?? undefined,
      targetId,
    });
    return createSuccessResponse({ entries });
  } catch (err) {
    return handleApiError(err);
  }
}

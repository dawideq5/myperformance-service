export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { verifyCode } from "@/lib/security/two-factor";
import { recordEvent } from "@/lib/security/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PostPayload {
  codeId: number;
  code: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw ApiError.unauthorized();

    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.codeId || !body?.code) {
      throw ApiError.badRequest("codeId + code required");
    }
    const result = await verifyCode({ codeId: body.codeId, code: body.code });

    const srcIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;

    if (!result.ok) {
      await recordEvent({
        severity: result.reason === "too_many_attempts" ? "high" : "medium",
        category: "2fa.verify_failed",
        source: "dashboard",
        title: `2FA verification failed: ${result.reason}`,
        srcIp,
        targetUser: session.user.email ?? undefined,
        details: { codeId: body.codeId, reason: result.reason },
      });
      return createSuccessResponse({ ok: false, reason: result.reason });
    }
    if (result.userId !== session.user.id) {
      throw ApiError.forbidden("Code belongs to different user");
    }
    await recordEvent({
      severity: "info",
      category: "2fa.verify_success",
      source: "dashboard",
      title: "2FA verified successfully",
      srcIp,
      targetUser: session.user.email ?? undefined,
      details: { purpose: result.purpose },
    });
    return createSuccessResponse({
      ok: true,
      purpose: result.purpose,
      // Token dla follow-up actions (5 min validity, embedded in JWT)
      // Frontend można użyć go w X-2FA-Token header dla sensitive endpoints
    });
  } catch (error) {
    return handleApiError(error);
  }
}

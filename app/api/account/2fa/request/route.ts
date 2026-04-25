export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requestCode } from "@/lib/security/two-factor";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PostPayload {
  purpose?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      throw ApiError.unauthorized();
    }
    const body = (await req.json().catch(() => ({}))) as PostPayload;
    const purpose = body.purpose ?? "sensitive_action";
    if (!["login", "sensitive_action", "password_change", "email_change"].includes(purpose)) {
      throw ApiError.badRequest("invalid purpose");
    }
    const srcIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    const result = await requestCode({
      userId: session.user.id,
      email: session.user.email,
      purpose,
      srcIp,
    });
    return createSuccessResponse({
      codeId: result.codeId,
      // Maskujemy email — tylko 2 pierwsze znaki
      email: result.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

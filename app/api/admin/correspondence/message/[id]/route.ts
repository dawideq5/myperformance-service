export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getMessageDetail } from "@/lib/postal-history";
import { listMessagesForConversation } from "@/lib/chatwoot/messages";
import { appendIamAudit } from "@/lib/permissions/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

/**
 * GET /api/admin/correspondence/message/{id}
 *
 * Szczegóły wątku:
 *   id format: "mail:<numericId>" → Postal getMessageDetail
 *   id format: "chat:<convId>"    → Chatwoot listMessagesForConversation
 *
 * Każde otwarcie loguje audit trail (`correspondence.view`).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    const decoded = decodeURIComponent(id);
    const actor = `admin:${session.user?.email ?? session.user?.id ?? "?"}`;

    if (decoded.startsWith("mail:")) {
      const numericId = Number(decoded.slice(5));
      if (!Number.isFinite(numericId)) {
        throw ApiError.badRequest("invalid mail id");
      }
      const detail = await getMessageDetail(numericId);
      if (!detail) throw ApiError.notFound("message not found");
      await appendIamAudit({
        actor,
        action: "correspondence.view",
        targetType: "postal_message",
        targetId: String(numericId),
        payload: { subject: detail.subject },
      });
      return createSuccessResponse({ kind: "mail", detail });
    }

    if (decoded.startsWith("chat:")) {
      const convId = Number(decoded.slice(5));
      if (!Number.isFinite(convId)) {
        throw ApiError.badRequest("invalid conv id");
      }
      const messages = await listMessagesForConversation(convId);
      await appendIamAudit({
        actor,
        action: "correspondence.view",
        targetType: "chatwoot_conversation",
        targetId: String(convId),
        payload: { messageCount: messages.length },
      });
      return createSuccessResponse({
        kind: "chat",
        conversationId: convId,
        messages,
      });
    }

    throw ApiError.badRequest("unsupported id prefix");
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { getMessageDetail } from "@/lib/postal-history";
import { listMessagesForConversation, listConversationsForContact } from "@/lib/chatwoot/messages";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";

/**
 * User-side detail wątku — sprawdza czy email zalogowanego usera występuje
 * w sender/recipient (mail) lub czy conversation należy do tego usera
 * (chatwoot contact email match). Zapobiega podglądowi cudzej korespondencji
 * przez zgadywanie ID.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const userEmail = session.user?.email?.trim().toLowerCase();
    if (!userEmail) throw ApiError.unauthorized();

    const { id } = await params;
    const decoded = decodeURIComponent(id);

    if (decoded.startsWith("mail:")) {
      const numericId = Number(decoded.slice(5));
      if (!Number.isFinite(numericId)) {
        throw ApiError.badRequest("invalid mail id");
      }
      const detail = await getMessageDetail(numericId);
      if (!detail) throw ApiError.notFound("message not found");
      // Ownership: user musi być w from/to (case-insensitive). Pole `to`
      // w Postal jest single-recipient string (multi-recipient = osobne msg).
      const owns =
        detail.from?.toLowerCase() === userEmail ||
        detail.to?.toLowerCase() === userEmail;
      if (!owns) throw ApiError.forbidden("not your message");
      return createSuccessResponse({ kind: "mail", detail });
    }

    if (decoded.startsWith("chat:")) {
      const convId = Number(decoded.slice(5));
      if (!Number.isFinite(convId)) {
        throw ApiError.badRequest("invalid conv id");
      }
      // Ownership: czat należy do user-a tylko gdy jego email pojawia się
      // w listConversationsForContact dla user-a. Dla pewności fetch listy
      // i sprawdź ID — niewielki overhead, ale eliminuje IDOR.
      const userConvs = await listConversationsForContact(userEmail);
      const owns = userConvs.some((c) => c.id === convId);
      if (!owns) throw ApiError.forbidden("not your conversation");
      const messages = await listMessagesForConversation(convId);
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

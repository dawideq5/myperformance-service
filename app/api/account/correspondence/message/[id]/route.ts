export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  listConversationsForContact,
  listMessagesForConversation,
} from "@/lib/chatwoot/messages";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";

/**
 * User-side: detail konwersacji Chatwoot. Sprawdza ownership — user musi
 * być contact (po email) konkretnej konwersacji. Eliminuje IDOR.
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
    const convId = Number(decoded.startsWith("chat:") ? decoded.slice(5) : decoded);
    if (!Number.isFinite(convId)) throw ApiError.badRequest("invalid id");

    const userConvs = await listConversationsForContact(userEmail);
    const owned = userConvs.find((c) => c.id === convId);
    if (!owned) throw ApiError.forbidden("not your conversation");

    const messages = await listMessagesForConversation(convId);
    return createSuccessResponse({
      conversationId: convId,
      inboxName: owned.inboxName,
      status: owned.status,
      contactEmail: owned.contactEmail,
      createdAt: owned.createdAt,
      updatedAt: owned.updatedAt,
      messages,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

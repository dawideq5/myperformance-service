export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import {
  isChatwootDbConfigured,
  listConversationsForContact,
} from "@/lib/chatwoot/messages";

/**
 * User-side: lista konwersacji Chatwoot dla zalogowanego usera.
 * Filtr po session.user.email — zapobiega podglądowi cudzych czatów.
 * Mail z Postal NIE jest zwracany (zmiana zasad: tab pokazuje tylko
 * historię aktywności z Chatwootem, mail trafił do osobnego admin
 * panelu /admin/correspondence).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const email = session.user?.email?.trim().toLowerCase();
    if (!email) throw ApiError.unauthorized();

    const hasChat = isChatwootDbConfigured();
    const convs = hasChat
      ? await listConversationsForContact(email).catch(() => [])
      : [];

    return createSuccessResponse({
      email,
      conversations: convs.map((c) => ({
        id: c.id,
        inboxName: c.inboxName,
        status: c.status,
        contactEmail: c.contactEmail,
        messageCount: c.messageCount,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      })),
      hasChatSource: hasChat,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

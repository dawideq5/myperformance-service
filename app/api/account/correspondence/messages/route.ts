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
  isPostalHistoryConfigured,
  listMessagesForAddress,
} from "@/lib/postal-history";
import {
  isChatwootDbConfigured,
  listConversationsForContact,
} from "@/lib/chatwoot/messages";

/**
 * User-side correspondence list — pobiera własne wątki (mail + chat)
 * dla zalogowanego usera (session.user.email). Bez admin gate, ale
 * filtr po WŁASNYM emailu zapobiega podglądowi cudzej korespondencji.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const email = session.user?.email?.trim().toLowerCase();
    if (!email) throw ApiError.unauthorized();

    const url = new URL(req.url);
    const beforeStr = url.searchParams.get("before");
    const before = beforeStr ? new Date(beforeStr) : null;
    if (before && isNaN(before.getTime())) {
      throw ApiError.badRequest("invalid 'before' timestamp");
    }

    const [mails, convs] = await Promise.all([
      isPostalHistoryConfigured()
        ? listMessagesForAddress(email, { limit: 100 }).catch(() => [])
        : Promise.resolve([]),
      isChatwootDbConfigured()
        ? listConversationsForContact(email).catch(() => [])
        : Promise.resolve([]),
    ]);

    interface ThreadItem {
      kind: "mail" | "chat";
      id: string;
      timestamp: number;
      subject: string;
      direction?: "outbound" | "inbound";
      status?: number | string;
      from?: string;
      to?: string;
      messageCount?: number;
    }

    const items: ThreadItem[] = [];
    for (const m of mails) {
      items.push({
        kind: "mail",
        id: `mail:${m.id}`,
        timestamp: m.timestamp * 1000,
        subject: m.subject || "(bez tematu)",
        direction: m.direction,
        status: m.status,
        from: m.from,
        to: m.to,
      });
    }
    for (const c of convs) {
      items.push({
        kind: "chat",
        id: `chat:${c.id}`,
        timestamp: new Date(c.updatedAt).getTime(),
        subject: `Czat ${c.inboxName} #${c.id}`,
        status: c.status,
        from: c.contactEmail,
        messageCount: c.messageCount,
      });
    }

    let filtered = items;
    if (before) {
      const t = before.getTime();
      filtered = items.filter((it) => it.timestamp < t);
    }
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return createSuccessResponse({
      email,
      items: filtered.slice(0, 100),
      hasMailSource: isPostalHistoryConfigured(),
      hasChatSource: isChatwootDbConfigured(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

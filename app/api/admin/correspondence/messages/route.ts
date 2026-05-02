export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  isPostalHistoryConfigured,
  listMessagesForAddress,
} from "@/lib/postal-history";
import {
  isChatwootDbConfigured,
  listConversationsForContact,
} from "@/lib/chatwoot/messages";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

/**
 * GET /api/admin/correspondence/messages?email=X[&before=ISO]
 *
 * Środkowa kolumna — lista wątków dla wybranego adresu. Łączy:
 *   - Postal messages (outbound + inbound)
 *   - Chatwoot conversations (z email-channel inboxów)
 *
 * Każdy element ma `kind: "mail" | "chat"`, `timestamp` (ms epoch),
 * `subject`, `direction` (mail) lub `status` (chat).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim();
    if (!email) throw ApiError.badRequest("email param required");
    const beforeStr = url.searchParams.get("before");
    const before = beforeStr ? new Date(beforeStr) : null;
    if (before && isNaN(before.getTime())) {
      throw ApiError.badRequest("invalid 'before' ISO timestamp");
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

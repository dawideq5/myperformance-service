export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  getChatwootAttachment,
  listConversationsForContact,
  listMessagesForConversation,
} from "@/lib/chatwoot/messages";
import {
  ApiError,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";

const HTML_LIKE = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

function escapeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, "_").slice(0, 200);
}

function safeContentType(ct: string): string {
  return HTML_LIKE.has(ct.toLowerCase()) ? "application/octet-stream" : ct;
}

/**
 * User-side: pobiera załącznik z Chatwoot tylko gdy konwersacja należy
 * do user-a (contact email match). Mail attachments — nie obsługujemy
 * (zmiana zasad — tab user-side jest tylko Chatwoot).
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
    const attachmentId = Number(
      decoded.startsWith("chat:") ? decoded.slice(5) : decoded,
    );
    if (!Number.isFinite(attachmentId)) throw ApiError.badRequest("invalid id");

    const att = await getChatwootAttachment(attachmentId);
    if (!att || !att.externalUrl) throw ApiError.notFound("not found");

    // Ownership — szukamy konwersacji user-a zawierającej ten attachment.
    const userConvs = await listConversationsForContact(userEmail);
    let owns = false;
    for (const c of userConvs) {
      const msgs = await listMessagesForConversation(c.id);
      if (msgs.some((m) => m.attachments?.some((a) => a.id === attachmentId))) {
        owns = true;
        break;
      }
    }
    if (!owns) throw ApiError.forbidden("not your attachment");

    const upstream = await fetch(att.externalUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) throw ApiError.serviceUnavailable("upstream failed");
    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    const data = await upstream.arrayBuffer();
    const filename = escapeFilename(`chatwoot-${attachmentId}`);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": safeContentType(ct),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

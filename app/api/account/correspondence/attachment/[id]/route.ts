export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  downloadAttachment,
  getMessageDetail,
} from "@/lib/postal-history";
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

/**
 * User-side attachment proxy — pobiera załącznik tylko gdy zalogowany user
 * jest właścicielem wątku (sender/recipient mail lub contact chatwoot).
 * Bez ownership check user mógłby pobrać dowolny załącznik znając ID.
 */

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
      const parts = decoded.slice(5).split(":");
      if (parts.length < 2) throw ApiError.badRequest("invalid id");
      const messageId = Number(parts[0]);
      const attachmentId = parts.slice(1).join(":");
      if (!Number.isFinite(messageId) || !attachmentId) {
        throw ApiError.badRequest("invalid id");
      }
      const detail = await getMessageDetail(messageId);
      if (!detail) throw ApiError.notFound("message not found");
      const owns =
        detail.from?.toLowerCase() === userEmail ||
        detail.to?.toLowerCase() === userEmail;
      if (!owns) throw ApiError.forbidden("not your attachment");

      const att = await downloadAttachment(messageId, attachmentId);
      if (!att) throw ApiError.notFound("attachment not found");
      const filename = escapeFilename(att.filename);
      return new Response(new Uint8Array(att.data), {
        status: 200,
        headers: {
          "Content-Type": safeContentType(att.contentType),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (decoded.startsWith("chat:")) {
      const attachmentId = Number(decoded.slice(5));
      if (!Number.isFinite(attachmentId)) {
        throw ApiError.badRequest("invalid id");
      }
      const att = await getChatwootAttachment(attachmentId);
      if (!att || !att.externalUrl) throw ApiError.notFound("not found");

      // Ownership: szukamy convId zawierającego ten attachment, sprawdzamy
      // czy user posiada conv. Cost: 1 SQL query lookup po messages.
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
    }

    throw ApiError.badRequest("unsupported id");
  } catch (error) {
    return handleApiError(error);
  }
}

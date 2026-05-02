export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { downloadAttachment } from "@/lib/postal-history";
import { getChatwootAttachment } from "@/lib/chatwoot/messages";
import { appendIamAudit } from "@/lib/permissions/db";
import { ApiError, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/admin/correspondence/attachment/{id}
 *
 * Proxy attachment binary. Two id formats:
 *   "mail:<messageId>:<attachmentId>"  — Postal email attachment (base64 z API)
 *   "chat:<chatwootAttachmentId>"      — Chatwoot attachment (external URL z S3/local)
 *
 * Bezpieczeństwo:
 *   - admin-only (requireAdminPanel)
 *   - text/html zawsze podawany jako Content-Disposition: attachment +
 *     X-Content-Type-Options: nosniff (nigdy inline rendering — ryzyko XSS)
 *   - filename escaped (RFC 5987)
 *   - audit log każde pobranie
 */

const HTML_LIKE = new Set(["text/html", "application/xhtml+xml", "image/svg+xml"]);

function escapeFilename(name: string): string {
  // RFC 5987 — fallback ASCII + UTF-8 encoded version. Usuwamy CRLF + " z nazwy
  // żeby nie wstrzyknąć dodatkowych nagłówków.
  const safe = name.replace(/[\r\n"\\]/g, "_").slice(0, 200);
  return safe;
}

function safeContentType(ct: string): string {
  // text/html lub html-like → wymuś application/octet-stream (force download).
  // Inne typy zostawiamy ale i tak idą jako attachment.
  const lc = ct.toLowerCase();
  if (HTML_LIKE.has(lc)) return "application/octet-stream";
  return ct;
}

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
      const parts = decoded.slice(5).split(":");
      if (parts.length < 2) throw ApiError.badRequest("invalid mail attachment id");
      const messageId = Number(parts[0]);
      const attachmentId = parts.slice(1).join(":");
      if (!Number.isFinite(messageId) || !attachmentId) {
        throw ApiError.badRequest("invalid mail attachment id");
      }
      const att = await downloadAttachment(messageId, attachmentId);
      if (!att) throw ApiError.notFound("attachment not found");
      await appendIamAudit({
        actor,
        action: "correspondence.attachment.download",
        targetType: "postal_attachment",
        targetId: `${messageId}:${attachmentId}`,
        payload: { filename: att.filename, size: att.data.length },
      });
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
        throw ApiError.badRequest("invalid chat attachment id");
      }
      const att = await getChatwootAttachment(attachmentId);
      if (!att || !att.externalUrl) throw ApiError.notFound("attachment not found");
      const upstream = await fetch(att.externalUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok) {
        throw ApiError.serviceUnavailable("upstream fetch failed");
      }
      const contentType =
        upstream.headers.get("content-type") || "application/octet-stream";
      const data = await upstream.arrayBuffer();
      const filename = escapeFilename(
        upstream.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
          `chatwoot-attachment-${attachmentId}`,
      );
      await appendIamAudit({
        actor,
        action: "correspondence.attachment.download",
        targetType: "chatwoot_attachment",
        targetId: String(attachmentId),
        payload: {
          filename,
          size: data.byteLength,
          fileType: att.fileType,
        },
      });
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": safeContentType(contentType),
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    throw ApiError.badRequest("unsupported attachment id prefix");
  } catch (error) {
    return handleApiError(error);
  }
}

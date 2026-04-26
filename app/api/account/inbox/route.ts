export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { withClient } from "@/lib/db";

interface InboxRow {
  id: string;
  event_key: string;
  title: string;
  body: string;
  severity: string;
  created_at: string;
  read_at: string | null;
}

function userId(session: { user?: { id?: string } }): string {
  const id = session.user?.id;
  if (!id) throw ApiError.unauthorized();
  return id;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? "50") || 50,
      200,
    );

    const r = await withClient((c) =>
      c.query<InboxRow>(
        `SELECT id::text, event_key, title, body, severity,
                created_at::text, read_at::text
           FROM mp_inbox
          WHERE user_id = $1
            ${unreadOnly ? "AND read_at IS NULL" : ""}
          ORDER BY created_at DESC
          LIMIT $2`,
        [userId(session), limit],
      ),
    );

    const totalUnread = await withClient(async (c) => {
      const t = await c.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM mp_inbox
          WHERE user_id = $1 AND read_at IS NULL`,
        [userId(session)],
      );
      return Number(t.rows[0]?.n ?? "0");
    });

    return createSuccessResponse({
      items: r.rows,
      unread: totalUnread,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PatchBody {
  ids?: string[];
  markAllRead?: boolean;
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) throw ApiError.badRequest("Invalid body");

    if (body.markAllRead) {
      await withClient((c) =>
        c.query(
          `UPDATE mp_inbox SET read_at = now()
            WHERE user_id = $1 AND read_at IS NULL`,
          [userId(session)],
        ),
      );
      return createSuccessResponse({ ok: true });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids
        .filter((s): s is string => typeof s === "string")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n));
      if (ids.length === 0) {
        return createSuccessResponse({ ok: true });
      }
      await withClient((c) =>
        c.query(
          `UPDATE mp_inbox SET read_at = now()
            WHERE user_id = $1 AND id = ANY($2::bigint[])
              AND read_at IS NULL`,
          [userId(session), ids],
        ),
      );
      return createSuccessResponse({ ok: true });
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

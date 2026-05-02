export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { withClient } from "@/lib/db";
import { isUserVisibleEvent } from "@/lib/preferences";
import { keycloak } from "@/lib/keycloak";

interface InboxRow {
  id: string;
  event_key: string;
  title: string;
  body: string;
  severity: string;
  created_at: string;
  read_at: string | null;
}

/**
 * Rozwiązujemy KC user id (sub) z dwóch źródeł — kolejność priorytetów:
 *  1) NextAuth session (dashboard / web flow)
 *  2) Bearer token z KC userinfo (panele sprzedawca/serwisant/kierowca,
 *     proxy przez /api/relay/account/inbox)
 *
 * Zwraca null gdy ani session, ani Bearer nie pozwalają na identyfikację
 * — caller wyrzuca 401.
 */
async function resolveUserId(req: Request): Promise<string | null> {
  // 1) NextAuth session — same-origin web requests.
  const session = await getServerSession(authOptions);
  const sessionUserId = (session as { user?: { id?: string } } | null)?.user
    ?.id;
  if (sessionUserId) return sessionUserId;

  // 2) Bearer token — panele forwardują `Authorization: Bearer <kc>`.
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const issuer = keycloak.getIssuer();
    const r = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${m[1].trim()}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    const userinfo = (await r.json()) as { sub?: string };
    return userinfo.sub ?? null;
  } catch {
    return null;
  }
}

async function requireUserId(req: Request): Promise<string> {
  const id = await resolveUserId(req);
  if (!id) throw ApiError.unauthorized();
  return id;
}

export async function GET(request: Request) {
  try {
    const uid = await requireUserId(request);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? "50") || 50,
      200,
    );

    // Pobieramy z marginesem (×3) bo w mp_inbox są też audit eventy
    // (security.*) których nie pokazujemy userowi — odfiltrowujemy je
    // post-fetch przez `isUserVisibleEvent`. Limit×3 daje zapas żeby
    // user widział `limit` user-facing eventów nawet jeśli ostatnie
    // 50 wpisów to był burst security audit (np. po brute force).
    const fetchLimit = Math.min(limit * 3, 600);

    const r = await withClient((c) =>
      c.query<InboxRow>(
        `SELECT id::text, event_key, title, body, severity,
                created_at::text, read_at::text
           FROM mp_inbox
          WHERE user_id = $1
            ${unreadOnly ? "AND read_at IS NULL" : ""}
          ORDER BY created_at DESC
          LIMIT $2`,
        [uid, fetchLimit],
      ),
    );

    const visible = r.rows
      .filter((row) => isUserVisibleEvent(row.event_key))
      .slice(0, limit);

    // Unread count też user-visible-only — bell badge nie powinien
    // świecić gdy jedyne nieprzeczytane są to "security.login.new_device".
    // Liczymy w aplikacji (mała liczba wierszy) zamiast budować skomplikowany
    // SQL z dynamiczną listą event_keys.
    const totalUnread = await withClient(async (c) => {
      const t = await c.query<{ event_key: string; n: string }>(
        `SELECT event_key, COUNT(*)::text AS n FROM mp_inbox
          WHERE user_id = $1 AND read_at IS NULL
          GROUP BY event_key`,
        [uid],
      );
      let total = 0;
      for (const row of t.rows) {
        if (isUserVisibleEvent(row.event_key)) total += Number(row.n);
      }
      return total;
    });

    return createSuccessResponse({
      items: visible,
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
    const uid = await requireUserId(request);

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) throw ApiError.badRequest("Invalid body");

    if (body.markAllRead) {
      await withClient((c) =>
        c.query(
          `UPDATE mp_inbox SET read_at = now()
            WHERE user_id = $1 AND read_at IS NULL`,
          [uid],
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
          [uid, ids],
        ),
      );
      return createSuccessResponse({ ok: true });
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/account/inbox — czyści wszystkie powiadomienia usera.
 * Soft-delete by hard delete dla user-facing inbox (audit log eventów
 * security siedzi w mp_security_events; mp_inbox to tylko UI cache).
 */
export async function DELETE(request: Request) {
  try {
    const uid = await requireUserId(request);
    await withClient((c) =>
      c.query(`DELETE FROM mp_inbox WHERE user_id = $1`, [uid]),
    );
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

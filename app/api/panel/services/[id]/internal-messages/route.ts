export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  createInternalMessage,
  listInternalMessages,
  type AuthorRole,
} from "@/lib/services/internal-chat";
import { rateLimit } from "@/lib/rate-limit";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-internal-messages" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId))
    return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

/**
 * Wyznaczamy rolę autora w obrębie tego zlecenia. Heurystyka:
 *   - email == assigned_technician → "service"
 *   - email == received_by → "sales"
 *   - inaczej fallback "sales" (każdy z lokalizacji ma do tego dostęp;
 *     w panelu serwisanta wiadomości jako "service" są generowane).
 *
 * Dokładniejsze przypisanie będzie możliwe gdy mamy realm-role w userinfo
 * (Phase 2). Tymczasowy fallback nie szkodzi — UI i tak rozróżnia bubble po
 * authorRole.
 */
function determineAuthorRole(
  service: {
    assignedTechnician: string | null;
    receivedBy: string | null;
  },
  email: string,
): AuthorRole {
  const e = email.toLowerCase();
  if ((service.assignedTechnician ?? "").toLowerCase() === e) return "service";
  if ((service.receivedBy ?? "").toLowerCase() === e) return "sales";
  return "sales";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const messages = await listInternalMessages(id);
  const viewerRole = determineAuthorRole(service, user.email);
  return NextResponse.json(
    { messages, viewerRole },
    { headers: PANEL_CORS_HEADERS },
  );
}

interface CreateBody {
  body?: string;
  authorRole?: AuthorRole;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }

  // Rate-limit per (user, service): max 5/min — chroni przed flood
  // (akcydentalny F5 spam, skrypty użytkownika).
  const { id } = await params;
  const rl = rateLimit(`panel:internal-msg:${user.email}:${id}`, {
    capacity: 5,
    refillPerSec: 5 / 60, // 5 token / 60s
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...PANEL_CORS_HEADERS, "Retry-After": "60" } },
    );
  }

  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { error: "Bad JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const text = (body.body ?? "").toString().trim();
  if (!text) {
    return NextResponse.json(
      { error: "empty body" },
      { status: 422, headers: PANEL_CORS_HEADERS },
    );
  }
  if (text.length > 4096) {
    return NextResponse.json(
      { error: "body too long (max 4096 chars)" },
      { status: 422, headers: PANEL_CORS_HEADERS },
    );
  }

  const requestedRole = body.authorRole === "service" ? "service" : null;
  const authorRole: AuthorRole =
    requestedRole ?? determineAuthorRole(service, user.email);

  // Wave 22 / F9 — cache imienia i nazwiska autora z KC profile (panel-auth
  // pulluje given_name/family_name z access tokenu/userinfo). Pozwala UI
  // wyświetlać "Imię Nazwisko" zamiast pochodnej z email local-part.
  const authorFirstName = user.firstName?.trim() || null;
  const authorLastName = user.lastName?.trim() || null;
  const authorFullName =
    [authorFirstName, authorLastName].filter(Boolean).join(" ").trim() ||
    user.name?.trim() ||
    null;

  const created = await createInternalMessage({
    serviceId: id,
    body: text,
    authorEmail: user.email,
    authorRole,
    authorFirstName,
    authorLastName,
    authorName: authorFullName,
  });
  if (!created) {
    return NextResponse.json(
      { error: "create_failed" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  // Notyfikuj drugą stronę zespołu — przeciwna rola zlecenia.
  // sales → notify serwisanta (assignedTechnician); service → notify
  // sprzedawcy (receivedBy).
  const recipientEmail =
    authorRole === "sales"
      ? (service.assignedTechnician ?? null)
      : (service.receivedBy ?? null);
  if (recipientEmail && recipientEmail.toLowerCase() !== user.email.toLowerCase()) {
    try {
      const recipientUid = await getUserIdByEmail(recipientEmail);
      if (recipientUid) {
        const preview =
          text.length > 100 ? text.slice(0, 97) + "..." : text;
        await notifyUser(recipientUid, "chatwoot.message.new", {
          title: `Pytanie od zespołu · #${service.ticketNumber}`,
          body: `${user.name ?? user.email}: ${preview}`,
          severity: "info",
          payload: {
            serviceId: id,
            ticketNumber: service.ticketNumber,
            internalMessageId: created.id,
            authorRole,
          },
        });
      }
    } catch (err) {
      logger.warn("internal-msg notify failed", {
        serviceId: id,
        err: String(err),
      });
    }
  }

  // SSE push — drugi panel/widok detail otrzyma event w czasie rzeczywistym.
  publish({
    type: "internal_note_added",
    serviceId: id,
    userEmail: recipientEmail ?? null,
    payload: {
      messageId: created.id,
      authorRole,
      authorEmail: user.email,
    },
  });

  return NextResponse.json(
    { message: created },
    { status: 201, headers: PANEL_CORS_HEADERS },
  );
}

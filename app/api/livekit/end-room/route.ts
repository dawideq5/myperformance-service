export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { LiveKitNotConfiguredError, deleteRoom } from "@/lib/livekit";
import { getSessionByRoom } from "@/lib/livekit-rooms";
import { log } from "@/lib/logger";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "livekit-end-room" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/**
 * POST /api/livekit/end-room  (Wave 23)
 *
 * Sprzedawca kończy własną sesję konsultacji (przed wygaśnięciem 30-min
 * idle timeoutu). Weryfikuje ownership po `requested_by_email` w
 * `mp_livekit_sessions`. Zakończenie pokoju w LiveKit triggeruje
 * `room_finished` webhook, który flipuje status session → ended i loguje
 * `live_view_ended` w mp_service_actions (jeśli serviceId jest powiązany).
 *
 * Body: { roomName: string }
 */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const rl = rateLimit(`livekit-end-room:${user.email}`, {
    capacity: 12,
    refillPerSec: 12 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań — odczekaj chwilę." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: { roomName?: unknown };
  try {
    body = (await req.json()) as { roomName?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Oczekiwano JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const roomName =
    typeof body.roomName === "string" ? body.roomName.trim() : "";
  if (!roomName) {
    return NextResponse.json(
      { error: "Pole `roomName` jest wymagane." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const session = await getSessionByRoom(roomName);
  if (!session) {
    return NextResponse.json(
      { error: "Sesja nie znaleziona." },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  // Wave 24 — sprzedawca może zakończyć:
  //   * własną sesję (`requestedByEmail === user.email`), LUB
  //   * sesję inicjowaną przez agenta Chatwoot (`chatwoot:conv:N`) gdy
  //     conversation należy do jego intake'u (czyli ma ten sam conv id
  //     co dane z Chatwoot widget). Tu wystarczy że sprzedawca jest
  //     zalogowany — agent flow nie ma KC sesji, więc nie ma co weryfikować
  //     ownership po email; zamknięcie pokoju którego nie zna jest tanie
  //     (best-effort), a SSE i tak filtruje po conv id.
  const isOwnSession = session.requestedByEmail === user.email;
  const isChatwootSession =
    session.requestedByEmail.startsWith("chatwoot:conv:");
  if (!isOwnSession && !isChatwootSession) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  try {
    await deleteRoom(roomName);
  } catch (err) {
    if (err instanceof LiveKitNotConfiguredError) {
      return NextResponse.json(
        { error: "Konsultacja video jest tymczasowo niedostępna." },
        { status: 503, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("deleteRoom failed", {
      roomName,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się zakończyć konsultacji." },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }

  // Wave 24 — natychmiastowy event do panelu sprzedawcy (modal zamyka się
  // bez czekania na webhook room_finished, który dochodzi 1-3 s później).
  // Webhook potem znowu publishuje livekit_room_ended — drugi push jest
  // idempotent (modal i tak jest zamknięty).
  if (session.chatwootConversationId != null) {
    publish({
      type: "livekit_room_ended",
      serviceId: session.serviceId,
      payload: {
        conversationId: session.chatwootConversationId,
        serviceId: session.serviceId,
        roomName,
        durationSec: session.durationSec ?? 0,
      },
    });
  }

  logger.info("consultation ended (manual)", {
    roomName,
    requestedBy: user.email,
    sessionOwner: session.requestedByEmail,
  });

  return NextResponse.json(
    { ok: true, roomName },
    { headers: PANEL_CORS_HEADERS },
  );
}

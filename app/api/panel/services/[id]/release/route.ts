export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getService,
  updateService,
  type ServiceStatus,
} from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import { rateLimit } from "@/lib/rate-limit";
import { verifyReleaseCode } from "@/lib/service-release-codes";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-release" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  ) {
    return true;
  }
  return false;
}

/**
 * Statusy z których można wydać urządzenie. Po success ustawiamy `closed`.
 * Lista zgodna z UX: gdy zlecenie było odrzucone/zwrot bez naprawy, kod
 * również chroni przed nieautoryzowanym odbiorem cudzego sprzętu.
 */
const RELEASABLE_STATUSES: readonly ServiceStatus[] = [
  "delivered",
  "ready",
  "rejected_by_customer",
  "returned_no_repair",
];

interface ReleaseBody {
  code?: string;
}

/** POST: weryfikuje kod wydania, na success ustawia status=closed. */
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
  if (service.status === "closed") {
    return NextResponse.json(
      { error: "Zlecenie zostało już zamknięte." },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }
  if (
    !RELEASABLE_STATUSES.includes(service.status as ServiceStatus)
  ) {
    return NextResponse.json(
      {
        error:
          "Wydanie urządzenia możliwe tylko po finalnym statusie naprawy.",
        currentStatus: service.status,
      },
      { status: 409, headers: PANEL_CORS_HEADERS },
    );
  }

  // Rate limit: 10/min per zlecenie — chroni przed bruteforce z mutiple
  // sesji (verifyReleaseCode samo limituje przez attempts/lock, ale rate
  // limit redukuje hash CPU spam).
  const rl = rateLimit(`svc-release-verify:${id}`, {
    capacity: 10,
    refillPerSec: 10 / 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele prób. Spróbuj ponownie za chwilę." },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as ReleaseBody | null;
  const code = (body?.code ?? "").toString().trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Kod musi składać się z 6 cyfr." },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const result = await verifyReleaseCode(id, code, user.email);
  if (!result.ok) {
    if (result.reason === "no_record") {
      return NextResponse.json(
        {
          error:
            "Brak wygenerowanego kodu wydania dla tego zlecenia. Wyślij kod ponownie.",
        },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
    if (result.reason === "locked") {
      return NextResponse.json(
        {
          error:
            "Kod zablokowany ze względu na zbyt wiele błędnych prób. Spróbuj później.",
          lockedUntil: result.lockedUntil ?? null,
        },
        { status: 423, headers: PANEL_CORS_HEADERS },
      );
    }
    if (result.reason === "already_used") {
      return NextResponse.json(
        { error: "Ten kod został już wykorzystany." },
        { status: 410, headers: PANEL_CORS_HEADERS },
      );
    }
    // invalid_code lub directus_unconfigured
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "release_code_failed",
      actor: { email: user.email, name: user.name ?? user.email },
      summary: `Niepoprawny kod wydania (pozostało prób: ${result.attemptsLeft ?? 0}).`,
      payload: { reason: result.reason ?? "unknown" },
    });
    return NextResponse.json(
      {
        error: "Niepoprawny kod.",
        attemptsLeft: result.attemptsLeft ?? null,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // OK — przejście do `closed`. updateService waliduje canTransition; gdy
  // current status jest finalny (delivered/rejected_by_customer/
  // returned_no_repair) → closed jest zwykle dozwolone. Nie blokujemy gdy
  // matrix nie pozwala (rzadkie) — wracamy 409 z oryginalnym błędem.
  try {
    const updated = await updateService(id, { status: "closed" });
    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "release_completed",
      actor: { email: user.email, name: user.name ?? user.email },
      summary: "Wydanie urządzenia — kod poprawny, zlecenie zamknięte.",
      payload: { byEmail: user.email },
    });
    publish({
      type: "released",
      serviceId: id,
      payload: {
        ticketNumber: service.ticketNumber,
        byEmail: user.email,
      },
    });
    return NextResponse.json(
      { ok: true, service: updated },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("release close failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          "Kod poprawny, ale nie udało się zamknąć zlecenia. Skontaktuj się z administratorem.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

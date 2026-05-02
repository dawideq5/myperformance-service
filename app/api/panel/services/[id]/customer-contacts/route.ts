/**
 * Notatki o kontakcie z klientem (Wave 21 / Faza 1D).
 *
 * GET — lista wpisów (chronologicznie DESC).
 * POST — utwórz wpis. Rate limit 20 / 5min per (user) — typowo użytkownik
 *        rejestruje 1-2 kontakty na zlecenie.
 *
 * Side-effects:
 *  - logServiceAction `customer_contact_recorded`
 *  - publish SSE `customer_contact_recorded`
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import {
  createCustomerContact,
  listCustomerContacts,
  type CustomerContactChannel,
  type CustomerContactDirection,
} from "@/lib/service-customer-contacts";
import { publish } from "@/lib/sse-bus";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-customer-contacts" });

const ALLOWED_CHANNELS: CustomerContactChannel[] = [
  "phone",
  "in_person",
  "other",
];
const ALLOWED_DIRECTIONS: CustomerContactDirection[] = ["inbound", "outbound"];

const CHANNEL_LABEL: Record<CustomerContactChannel, string> = {
  phone: "telefoniczny",
  in_person: "osobisty",
  other: "inny",
};

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
  )
    return true;
  return false;
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
  const contacts = await listCustomerContacts(id);
  return NextResponse.json({ contacts }, { headers: PANEL_CORS_HEADERS });
}

interface PostBody {
  channel?: string;
  direction?: string;
  note?: string;
  contactedAt?: string;
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
  // Rate limit: 20 / 5 min per user (capacity=20, refill 20/(5*60)).
  const rl = rateLimit(`svc-customer-contacts:${user.email}`, {
    capacity: 20,
    refillPerSec: 20 / (5 * 60),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          "Rate limit — maks 20 wpisów na 5 minut. Spróbuj ponownie za chwilę.",
      },
      {
        status: 429,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const note = body?.note?.trim() ?? "";
  if (!note) {
    return NextResponse.json(
      { error: "Pole `note` jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (note.length > 5000) {
    return NextResponse.json(
      { error: "Notatka przekracza 5000 znaków" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const channel = ALLOWED_CHANNELS.includes(
    body?.channel as CustomerContactChannel,
  )
    ? (body!.channel as CustomerContactChannel)
    : null;
  if (!channel) {
    return NextResponse.json(
      {
        error: `Pole \`channel\` musi być jednym z: ${ALLOWED_CHANNELS.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const direction =
    body?.direction &&
    ALLOWED_DIRECTIONS.includes(body.direction as CustomerContactDirection)
      ? (body.direction as CustomerContactDirection)
      : null;

  let contactedAt: string | undefined;
  if (body?.contactedAt) {
    const ts = new Date(body.contactedAt);
    if (Number.isNaN(ts.getTime())) {
      return NextResponse.json(
        { error: "Pole `contactedAt` ma niepoprawny format ISO 8601" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
    contactedAt = ts.toISOString();
  }

  const recordedByName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const contact = await createCustomerContact({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      channel,
      direction,
      note,
      recordedByEmail: user.email,
      recordedByName,
      contactedAt,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "customer_contact_recorded",
      actor: { email: user.email, name: recordedByName },
      summary: `Zarejestrowano kontakt ${CHANNEL_LABEL[channel]}${direction ? ` (${direction === "inbound" ? "przychodzący" : "wychodzący"})` : ""}`,
      payload: {
        contactId: contact?.id ?? null,
        channel,
        direction,
        notePreview: note.slice(0, 120),
      },
    });

    publish({
      type: "customer_contact_recorded",
      serviceId: id,
      payload: {
        contactId: contact?.id ?? null,
        ticketNumber: service.ticketNumber,
        channel,
        direction,
        recordedByEmail: user.email,
        recordedByName,
        notePreview: note.slice(0, 200),
      },
    });

    return NextResponse.json(
      { contact },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("customer contact create failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się zapisać notatki", detail: String(err) },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

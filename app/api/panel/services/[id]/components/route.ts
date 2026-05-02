/**
 * Komponenty użyte w naprawie — list + create (Wave 20 / Phase 1E).
 *
 * GET — lista aktywnych komponentów dla zlecenia (totals computed app-layer).
 * POST — utwórz komponent. Rate limit: 30 / 5min per (serviceId, user).
 *
 * Auth: panel KC (Bearer token przez relay) + userOwns(service, locationIds).
 * SSE: createComponent() publishuje `component_added` przez sse-bus.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { rateLimit } from "@/lib/rate-limit";
import { logServiceAction } from "@/lib/service-actions";
import {
  ALLOWED_INVOICE_KINDS,
  ALLOWED_VAT_RATES,
  createComponent,
  listComponents,
  sumComponents,
  type ComponentInvoiceKind,
} from "@/lib/service-components";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-components" });

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

  const components = await listComponents(id);
  const totals = await sumComponents(id);
  return NextResponse.json(
    { components, totals },
    { headers: PANEL_CORS_HEADERS },
  );
}

interface PostBody {
  name?: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceKind?: ComponentInvoiceKind | null;
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  costNet?: number;
  quantity?: number;
  vatRate?: number;
  marginTargetPct?: number | null;
  invoiceFileId?: string | null;
  notes?: string | null;
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

  const rl = rateLimit(`svc-components:${id}:${user.email}`, {
    capacity: 30,
    refillPerSec: 30 / (5 * 60),
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          "Rate limit — maks 30 komponentów na 5 minut. Spróbuj ponownie za chwilę.",
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
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json(
      { error: "Pole `name` jest wymagane" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (name.length > 200) {
    return NextResponse.json(
      { error: "Nazwa przekracza 200 znaków" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const costNet = Number(body?.costNet);
  if (!Number.isFinite(costNet) || costNet < 0) {
    return NextResponse.json(
      { error: "Pole `costNet` musi być liczbą >= 0" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const quantity = body?.quantity != null ? Number(body.quantity) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json(
      { error: "Pole `quantity` musi być liczbą > 0" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const vatRate = body?.vatRate != null ? Number(body.vatRate) : 23;
  if (!ALLOWED_VAT_RATES.includes(vatRate)) {
    return NextResponse.json(
      {
        error: `Pole \`vatRate\` musi być jedną z wartości: ${ALLOWED_VAT_RATES.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const invoiceKind = body?.invoiceKind ?? null;
  if (invoiceKind && !ALLOWED_INVOICE_KINDS.includes(invoiceKind)) {
    return NextResponse.json(
      {
        error: `Pole \`invoiceKind\` musi być jedną z: ${ALLOWED_INVOICE_KINDS.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const marginTargetPct =
    body?.marginTargetPct == null ? null : Number(body.marginTargetPct);
  if (
    marginTargetPct != null &&
    (!Number.isFinite(marginTargetPct) ||
      marginTargetPct < -100 ||
      marginTargetPct > 1000)
  ) {
    return NextResponse.json(
      { error: "Pole `marginTargetPct` poza dopuszczalnym zakresem" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const actorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const component = await createComponent({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      name,
      supplierName: body?.supplierName ?? null,
      invoiceNumber: body?.invoiceNumber ?? null,
      invoiceKind,
      purchaseDate: body?.purchaseDate ?? null,
      deliveryDate: body?.deliveryDate ?? null,
      costNet,
      quantity,
      vatRate,
      marginTargetPct,
      invoiceFileId: body?.invoiceFileId ?? null,
      notes: body?.notes ?? null,
      createdByEmail: user.email,
      createdByName: actorName,
    });

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "component_added",
      actor: { email: user.email, name: actorName },
      summary: `Dodano komponent: ${name}`,
      payload: {
        componentId: component?.id ?? null,
        name,
        supplierName: body?.supplierName ?? null,
        invoiceNumber: body?.invoiceNumber ?? null,
        costNet,
        quantity,
        vatRate,
      },
    });

    return NextResponse.json(
      { component },
      { status: 201, headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("component create failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się dodać komponentu",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

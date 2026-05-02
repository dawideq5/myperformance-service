/**
 * Komponenty użyte w naprawie — patch + soft-delete (Wave 20 / Phase 1E).
 *
 * PATCH — partial update; recompute cost_gross w helperze.
 * DELETE — soft delete (deleted_at = now). Plik faktury nie jest usuwany
 *          z Directus (idempotentny rollback z UI byłby wtedy niemożliwy).
 *
 * Auth: panel KC + userOwns. Sprawdzamy że component.serviceId == route id —
 * obrona przed tampering ("popraw cudzy komponent przez ID + dowolny serviceId").
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { logServiceAction } from "@/lib/service-actions";
import {
  ALLOWED_INVOICE_KINDS,
  ALLOWED_VAT_RATES,
  getComponent,
  softDeleteComponent,
  updateComponent,
  type ComponentInvoiceKind,
} from "@/lib/service-components";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-components-item" });

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

interface PatchBody {
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, componentId } = await params;
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

  const existing = await getComponent(componentId);
  if (!existing || existing.serviceId !== id) {
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (existing.deletedAt) {
    return NextResponse.json(
      { error: "Component deleted" },
      { status: 410, headers: PANEL_CORS_HEADERS },
    );
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body wymagany" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Walidacja na poziomie endpointa — szybka odpowiedź dla klienta zanim
  // trafi do helpera. Helper waliduje też (defence-in-depth).
  if (body.costNet != null) {
    if (!Number.isFinite(body.costNet) || body.costNet < 0) {
      return NextResponse.json(
        { error: "Pole `costNet` musi być liczbą >= 0" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
  }
  if (body.quantity != null) {
    if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
      return NextResponse.json(
        { error: "Pole `quantity` musi być liczbą > 0" },
        { status: 400, headers: PANEL_CORS_HEADERS },
      );
    }
  }
  if (body.vatRate != null && !ALLOWED_VAT_RATES.includes(body.vatRate)) {
    return NextResponse.json(
      {
        error: `Pole \`vatRate\` musi być jedną z wartości: ${ALLOWED_VAT_RATES.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (body.invoiceKind && !ALLOWED_INVOICE_KINDS.includes(body.invoiceKind)) {
    return NextResponse.json(
      {
        error: `Pole \`invoiceKind\` musi być jedną z: ${ALLOWED_INVOICE_KINDS.join(", ")}`,
      },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (
    body.name !== undefined &&
    (!body.name || !body.name.trim() || body.name.length > 200)
  ) {
    return NextResponse.json(
      { error: "Pole `name` jest wymagane (max 200 znaków)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  const actorName =
    user.name?.trim() || user.preferred_username || user.email;

  try {
    const updated = await updateComponent(componentId, body);
    if (!updated) {
      return NextResponse.json(
        { error: "Update failed" },
        { status: 500, headers: PANEL_CORS_HEADERS },
      );
    }

    void logServiceAction({
      serviceId: id,
      ticketNumber: service.ticketNumber,
      action: "component_updated",
      actor: { email: user.email, name: actorName },
      summary: `Zaktualizowano komponent: ${updated.name}`,
      payload: {
        componentId,
        changes: body as Record<string, unknown>,
      },
    });

    return NextResponse.json(
      { component: updated },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    logger.error("component update failed", {
      componentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Nie udało się zaktualizować komponentu",
      },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, componentId } = await params;
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

  const existing = await getComponent(componentId);
  if (!existing || existing.serviceId !== id) {
    return NextResponse.json(
      { error: "Component not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (existing.deletedAt) {
    return NextResponse.json(
      { ok: true, alreadyDeleted: true },
      { headers: PANEL_CORS_HEADERS },
    );
  }

  const ok = await softDeleteComponent(componentId);
  if (!ok) {
    return NextResponse.json(
      { error: "Nie udało się usunąć komponentu" },
      { status: 500, headers: PANEL_CORS_HEADERS },
    );
  }

  const actorName =
    user.name?.trim() || user.preferred_username || user.email;

  void logServiceAction({
    serviceId: id,
    ticketNumber: service.ticketNumber,
    action: "component_deleted",
    actor: { email: user.email, name: actorName },
    summary: `Usunięto komponent: ${existing.name}`,
    payload: {
      componentId,
      name: existing.name,
      costNet: existing.costNet,
      invoiceFileId: existing.invoiceFileId,
    },
  });

  return NextResponse.json({ ok: true }, { headers: PANEL_CORS_HEADERS });
}

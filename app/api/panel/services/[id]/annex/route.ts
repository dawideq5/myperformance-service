export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { listServiceRevisions } from "@/lib/service-revisions";
import { renderAnnexPdf, type AnnexInput } from "@/lib/annex-pdf";

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

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  diagnosis: "Diagnoza",
  amountEstimate: "Kwota wyceny",
  amountFinal: "Kwota finalna",
  promisedAt: "Obiecana data",
  warrantyUntil: "Gwarancja do",
  customerFirstName: "Imię klienta",
  customerLastName: "Nazwisko klienta",
  contactPhone: "Telefon",
  contactEmail: "Email",
  brand: "Marka",
  model: "Model",
  imei: "IMEI",
  color: "Kolor",
  lockType: "Typ blokady",
  visualCondition: "Stan wizualny",
  intakeChecklist: "Checklist przyjęcia",
};

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "…" : v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Tak" : "Nie";
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  } catch {
    return String(v);
  }
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

  const revisions = await listServiceRevisions(id, 50);
  // Bierzemy zmiany od ostatniego potwierdzenia (Documenso) lub od początku.
  const documensoSentAt = service.visualCondition?.documenso?.sentAt;
  const cutoff = documensoSentAt ? new Date(documensoSentAt).getTime() : 0;
  const significantRevs = revisions.filter(
    (r) => r.isSignificant && new Date(r.createdAt).getTime() > cutoff,
  );

  if (significantRevs.length === 0) {
    return NextResponse.json(
      { error: "Brak zmian wymagających aneksu od ostatniego potwierdzenia" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }

  // Zbierz changes ze wszystkich significant revisions, deduplikuj po polu
  // (najnowsza wartość wygrywa).
  const merged = new Map<string, { before: unknown; after: unknown }>();
  for (const rev of [...significantRevs].reverse()) {
    for (const [field, ch] of Object.entries(rev.changes)) {
      if (!merged.has(field)) merged.set(field, { before: ch.before, after: ch.after });
      else merged.set(field, { before: merged.get(field)!.before, after: ch.after });
    }
  }

  const data: AnnexInput = {
    ticketNumber: service.ticketNumber ?? "—",
    serviceCreatedAt: service.createdAt ?? new Date().toISOString(),
    customer: {
      firstName: service.customerFirstName ?? "",
      lastName: service.customerLastName ?? "",
    },
    device: {
      brand: service.brand ?? "",
      model: service.model ?? "",
      imei: service.imei ?? "",
    },
    editor: {
      name: user.name?.trim() || user.preferred_username || user.email,
      email: user.email,
    },
    changes: Array.from(merged.entries()).map(([field, ch]) => ({
      field: FIELD_LABEL[field] ?? field,
      before: fmtValue(ch.before),
      after: fmtValue(ch.after),
    })),
    summary: significantRevs[0]?.summary ?? "Zmiany w warunkach zlecenia.",
    issuedAt: new Date().toISOString(),
  };

  const pdf = await renderAnnexPdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      ...PANEL_CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aneks-${service.ticketNumber ?? id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

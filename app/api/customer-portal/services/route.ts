import { NextResponse } from "next/server";
import { listItems } from "@/lib/directus-cms";
import { corsHeaders, preflightResponse } from "@/lib/customer-portal/cors";
import { getCustomerPrincipal } from "@/lib/customer-portal/principal";
import { SERVICE_STATUS_META, type ServiceStatus } from "@/lib/services";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const logger = log.child({ module: "customer-portal-services-list" });

interface ServiceRow {
  id: string;
  ticket_number: string;
  status: string | null;
  brand: string | null;
  model: string | null;
  amount_estimate: number | string | null;
  amount_final: number | string | null;
  contact_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function GET(req: Request) {
  const cors = corsHeaders(req);
  const principal = getCustomerPrincipal(req);
  if (!principal) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: cors },
    );
  }

  // Directus filter is case-sensitive on _eq; some users zapisują email z
  // wielką literą. Pobieramy szerzej (search = email — textsearch
  // case-insensitive po wszystkich stringach) i filtrujemy lokalnie po
  // contact_email lowercase. Limit 200 wystarczy bo jeden klient nie ma
  // setek zleceń (typowo <10).
  let rows: ServiceRow[] = [];
  try {
    rows = await listItems<ServiceRow>("mp_services", {
      search: principal.email,
      sort: "-updated_at",
      limit: 200,
      fields:
        "id,ticket_number,status,brand,model,amount_estimate,amount_final,contact_email,created_at,updated_at",
    });
  } catch (err) {
    logger.warn("listItems failed", { err: String(err) });
    return NextResponse.json(
      { items: [], total: 0 },
      { status: 200, headers: cors },
    );
  }

  const norm = principal.email.toLowerCase();
  const filtered = rows.filter(
    (r) => (r.contact_email ?? "").trim().toLowerCase() === norm,
  );

  const items = filtered.map((r) => {
    const status = (r.status as ServiceStatus | null) ?? "received";
    const meta = SERVICE_STATUS_META[status] ?? null;
    return {
      id: r.id,
      ticketNumber: r.ticket_number,
      status,
      statusLabel: meta?.label ?? status,
      brand: r.brand,
      model: r.model,
      amountEstimate:
        r.amount_estimate == null ? null : Number(r.amount_estimate),
      amountFinal: r.amount_final == null ? null : Number(r.amount_final),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return NextResponse.json(
    { items, total: items.length },
    { status: 200, headers: cors },
  );
}

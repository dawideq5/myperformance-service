export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import {
  getService,
  updateService,
  StatusTransitionError,
  type UpdateServiceInput,
} from "@/lib/services";
import {
  diffServiceUpdate,
  recordServiceRevision,
} from "@/lib/service-revisions";
import { logServiceAction } from "@/lib/service-actions";
import { getDocument } from "@/lib/documenso";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-services-patch" });

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

  // Polling fallback: gdy Documenso doc istnieje i status="sent" (czeka
  // na klienta), sprawdzamy aktualny stan w Documenso. Webhook może
  // pominąć event (network glitch) — direct fetch zapewnia że UI
  // odzwierciedla rzeczywisty status. Wywoływane przy każdym GET (frontend
  // pollu co 5s, więc zsynchronizujemy w max 5s).
  const cur = service.visualCondition?.documenso;
  if (cur?.docId && cur.status === "sent") {
    try {
      const doc = await getDocument(cur.docId);
      if (doc) {
        const allSigned = (doc.recipients ?? []).every(
          (r) => r.status === "completed",
        );
        const anyDeclined = (doc.recipients ?? []).some(
          (r) => r.status === "declined",
        );
        let newStatus:
          | "sent"
          | "signed"
          | "rejected"
          | "expired"
          | "employee_signed"
          | null = null;
        if (allSigned) newStatus = "signed";
        else if (anyDeclined) newStatus = "rejected";
        if (newStatus && (newStatus as string) !== cur.status) {
          const updated = {
            ...cur,
            status: newStatus,
            completedAt: new Date().toISOString(),
            ...(newStatus === "signed" ? { signedPdfUrl: "available" } : {}),
          };
          try {
            await updateService(service.id, {
              visualCondition: {
                ...(service.visualCondition ?? {}),
                documenso: updated,
              } as typeof service.visualCondition,
            });
            void logServiceAction({
              serviceId: service.id,
              ticketNumber: service.ticketNumber,
              action: newStatus === "signed" ? "client_signed" : "client_rejected",
              actor: { name: "Klient" },
              summary: "",
              payload: { documentId: cur.docId },
            });
            // Refresh fetched service żeby zwrócić nowy status w response.
            service.visualCondition = {
              ...(service.visualCondition ?? {}),
              documenso: updated,
            };
          } catch (err) {
            log.warn("documenso poll sync failed", {
              serviceId: service.id,
              err: String(err),
            });
          }
        }
      }
    } catch {
      /* polling best-effort, błąd nie blokuje response */
    }
  }

  return NextResponse.json({ service }, { headers: PANEL_CORS_HEADERS });
}

export async function PATCH(
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
  const existing = await getService(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(existing, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const body = (await req.json().catch(() => null)) as UpdateServiceInput | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const diff = diffServiceUpdate(existing, body);
  logger.info("PATCH service", {
    serviceId: id,
    user: user.email,
    fields: Object.keys(body),
    changedFields: Object.keys(diff.changes),
  });

  // Lock zmian gdy urządzenie wyszło z punktu sprzedaży (transport
  // picked_up / in_transit / delivered). Sprzedawca nie może edytować
  // bo urządzenie jest fizycznie u kierowcy lub w serwisie — żadne
  // zmiany merytoryczne nie mają sensu (potwierdzenie już niemożliwe
  // do podpisania na miejscu).
  const { listTransportJobs } = await import("@/lib/transport-jobs");
  const activeJobs = await listTransportJobs({
    serviceId: id,
    status: ["assigned", "in_transit", "delivered"],
    limit: 5,
  });
  if (activeJobs.length > 0 && Object.keys(diff.changes).length > 0) {
    return NextResponse.json(
      {
        error:
          "Urządzenie zostało już wydane kierowcy — edycja zlecenia jest zablokowana.",
        transportJobStatus: activeJobs[0].status,
      },
      { status: 423, headers: PANEL_CORS_HEADERS },
    );
  }

  // Po istotnej edycji (cena, diagnoza, gwarancja) unieważniamy
  // wszystkie aktywne podpisy żeby zapobiec rozjazdowi treści między
  // dokumentem podpisanym przez klienta a aktualnym stanem serwisu.
  // Status Documenso przechodzi na "expired" + DELETE w Documenso
  // (deletedAt) — klient nie może już otworzyć starego linku.
  // mergeJsonb traktuje `null` jako delete-key.
  if (diff.isSignificant) {
    const vcPatch = {
      ...((body.visualCondition as Record<string, unknown>) ?? {}),
      employeeSignature: null,
    } as Record<string, unknown>;
    const curDocumenso = existing.visualCondition?.documenso;
    const invalidatableStatuses = new Set([
      "sent",
      "employee_signed",
      "signed",
      "paper_pending",
      "paper_signed",
    ]);
    if (curDocumenso?.docId && invalidatableStatuses.has(curDocumenso.status)) {
      vcPatch.documenso = { ...curDocumenso, status: "expired" };
      // Async DELETE w Documenso — fallback DB w lib/documenso obsługuje
      // 500 przez REST. Klient po unieważnieniu dostanie 404 jeśli
      // próbuje otworzyć stary signing link.
      const { deleteDocument } = await import("@/lib/documenso");
      void deleteDocument(curDocumenso.docId).catch((err) => {
        logger.warn("auto-invalidate Documenso failed", {
          serviceId: id,
          docId: curDocumenso.docId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }
    if (existing.visualCondition?.paperSigned) {
      // Istotna zmiana po podpisie papierowym też unieważnia stary podpis.
      vcPatch.paperSigned = null;
    }
    body.visualCondition = vcPatch as typeof body.visualCondition;
  }

  try {
    const service = await updateService(id, body);
    // Zapisz rewizję — best-effort, błąd nie blokuje update'u.
    void recordServiceRevision({
      service: existing,
      input: body,
      editor: {
        email: user.email,
        name: user.name?.trim() || user.preferred_username || user.email,
      },
    });
    return NextResponse.json(
      {
        service,
        revision: {
          significant: diff.isSignificant,
          summary: diff.summary,
          changedFields: Object.keys(diff.changes),
        },
      },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    if (err instanceof StatusTransitionError) {
      logger.warn("PATCH blocked by transition", {
        serviceId: id,
        from: err.from,
        to: err.to,
      });
      return NextResponse.json(
        { error: err.message, from: err.from, to: err.to },
        { status: 409, headers: PANEL_CORS_HEADERS },
      );
    }
    logger.error("PATCH failed", {
      serviceId: id,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
}

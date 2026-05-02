import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import { publish } from "@/lib/sse-bus";

const logger = log.child({ module: "service-actions" });

export type ServiceActionKind =
  | "employee_sign"
  | "print"
  | "send_electronic"
  | "resend_electronic"
  | "client_signed"
  | "client_rejected"
  | "annex_issued"
  | "status_change"
  | "quote_changed"
  | "annex_created"
  | "annex_accepted"
  | "annex_rejected"
  | "annex_resend"
  // Wave 21 / Faza 1E — automatyczne unieważnianie pending aneksów przy
  // zmianie wyceny lub adresu e-mail klienta.
  | "annex_expired"
  | "photo_uploaded"
  | "photo_deleted"
  | "note_added"
  | "note_deleted"
  | "transport_requested"
  | "transport_updated"
  | "transport_cancelled"
  | "part_ordered"
  | "part_updated"
  | "part_received"
  | "part_deleted"
  | "upload_bridge_token_issued"
  // Wave 20 / Faza 1D — edycja zlecenia z poziomu serwisanta.
  | "damage_marker_added"
  | "damage_marker_removed"
  | "damage_marker_updated"
  | "visual_notes_updated"
  | "customer_data_updated"
  | "device_condition_updated"
  | "repair_type_changed"
  | "service_created_quick"
  // Wave 20 / Faza 1E — komponenty użyte (części, koszty, marża).
  | "component_added"
  | "component_updated"
  | "component_deleted"
  // Wave 20 / Faza 1F — wysyłka wiadomości do klienta z poziomu panelu
  // (SMS / email / Chatwoot).
  | "customer_message_sent"
  // Wave 21 / Faza 1C — wydanie urządzenia (release code).
  | "release_code_generated"
  | "release_code_sent"
  | "release_code_resent"
  | "release_code_failed"
  | "release_completed"
  // Wave 21 / Faza 1D — ręczna notatka o kontakcie z klientem (telefon /
  // osobiście / inne) zarejestrowana z panelu serwisanta.
  | "customer_contact_recorded"
  | "other";

export interface ServiceAction {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  action: ServiceActionKind;
  actorEmail: string | null;
  actorName: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  action: ServiceActionKind;
  actor_email: string | null;
  actor_name: string | null;
  summary: string | null;
  payload: unknown;
  created_at: string;
}

function mapRow(r: Row): ServiceAction {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    action: r.action,
    actorEmail: r.actor_email,
    actorName: r.actor_name,
    summary: r.summary ?? "",
    payload: (r.payload ?? null) as Record<string, unknown> | null,
    createdAt: r.created_at,
  };
}

export async function logServiceAction(input: {
  serviceId: string;
  ticketNumber?: string | null;
  action: ServiceActionKind;
  actor?: { email?: string; name?: string } | null;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!(await directusConfigured())) return;
  try {
    await createItem<Row>("mp_service_actions", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      action: input.action,
      actor_email: input.actor?.email ?? null,
      actor_name: input.actor?.name ?? null,
      summary: input.summary,
      payload: input.payload ?? null,
    });
    // Real-time push do paneli (Wave 19/Phase 1D). Best-effort — sync,
    // try-catch wewnątrz publish() chroni przed padnięciem subscriberów.
    publish({
      type: "action_logged",
      serviceId: input.serviceId,
      payload: {
        ticketNumber: input.ticketNumber ?? null,
        action: input.action,
        actorEmail: input.actor?.email ?? null,
        actorName: input.actor?.name ?? null,
        summary: input.summary,
        meta: input.payload ?? null,
      },
    });
  } catch (err) {
    logger.warn("logServiceAction failed", {
      serviceId: input.serviceId,
      action: input.action,
      err: String(err),
    });
  }
}

export async function listServiceActions(
  serviceId: string,
  limit = 100,
): Promise<ServiceAction[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<Row>("mp_service_actions", {
      "filter[service_id][_eq]": serviceId,
      sort: "-created_at",
      limit,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServiceActions failed", { err: String(err) });
    return [];
  }
}

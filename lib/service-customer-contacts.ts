/**
 * Notatki o kontakcie z klientem (Wave 21 / Faza 1D).
 *
 * Każdy off-channel kontakt z klientem (telefon / wizyta / inny) loguje się
 * w `mp_service_customer_contacts`. UI w `KlientTab → CustomerCommunicationLog`
 * łączy te wpisy z Chatwoot conversations + Postal mailami w jeden
 * chronologiczny stream.
 *
 * To jest stricte ręczne — backend nigdy sam tu nie wpisuje. Wysyłka SMS /
 * email automatycznie idzie do Postal/Chatwoot i pojawia się tam.
 */

import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-customer-contacts" });

export type CustomerContactChannel = "phone" | "in_person" | "other";
export type CustomerContactDirection = "inbound" | "outbound";

export interface CustomerContact {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  channel: CustomerContactChannel;
  direction: CustomerContactDirection | null;
  note: string;
  recordedByEmail: string | null;
  recordedByName: string | null;
  contactedAt: string;
  createdAt: string;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  channel: string | null;
  direction: string | null;
  note: string;
  recorded_by_email: string | null;
  recorded_by_name: string | null;
  contacted_at: string;
  created_at: string;
}

const ALLOWED_CHANNELS: CustomerContactChannel[] = [
  "phone",
  "in_person",
  "other",
];
const ALLOWED_DIRECTIONS: CustomerContactDirection[] = ["inbound", "outbound"];

function mapRow(r: Row): CustomerContact {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    channel: ALLOWED_CHANNELS.includes(r.channel as CustomerContactChannel)
      ? (r.channel as CustomerContactChannel)
      : "other",
    direction: ALLOWED_DIRECTIONS.includes(
      r.direction as CustomerContactDirection,
    )
      ? (r.direction as CustomerContactDirection)
      : null,
    note: r.note,
    recordedByEmail: r.recorded_by_email,
    recordedByName: r.recorded_by_name,
    contactedAt: r.contacted_at,
    createdAt: r.created_at,
  };
}

export interface CreateCustomerContactInput {
  serviceId: string;
  ticketNumber?: string | null;
  channel: CustomerContactChannel;
  direction?: CustomerContactDirection | null;
  note: string;
  recordedByEmail: string;
  recordedByName: string;
  contactedAt?: string;
}

export async function createCustomerContact(
  input: CreateCustomerContactInput,
): Promise<CustomerContact | null> {
  if (!(await directusConfigured())) return null;
  const note = input.note.trim();
  if (!note) {
    throw new Error("Note body is required");
  }
  if (note.length > 5000) {
    throw new Error("Note body exceeds 5000 characters");
  }
  if (!ALLOWED_CHANNELS.includes(input.channel)) {
    throw new Error(`Invalid channel: ${input.channel}`);
  }
  if (
    input.direction &&
    !ALLOWED_DIRECTIONS.includes(input.direction)
  ) {
    throw new Error(`Invalid direction: ${input.direction}`);
  }
  try {
    const created = await createItem<Row>("mp_service_customer_contacts", {
      service_id: input.serviceId,
      ticket_number: input.ticketNumber ?? null,
      channel: input.channel,
      direction: input.direction ?? null,
      note,
      recorded_by_email: input.recordedByEmail,
      recorded_by_name: input.recordedByName,
      contacted_at: input.contactedAt ?? new Date().toISOString(),
    });
    return mapRow(created);
  } catch (err) {
    logger.warn("createCustomerContact failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
    throw err;
  }
}

export async function listCustomerContacts(
  serviceId: string,
  limit = 200,
): Promise<CustomerContact[]> {
  if (!(await directusConfigured())) return [];
  const lim = Math.min(Math.max(limit, 1), 500);
  try {
    const rows = await listItems<Row>("mp_service_customer_contacts", {
      "filter[service_id][_eq]": serviceId,
      sort: "-contacted_at",
      limit: lim,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listCustomerContacts failed", {
      serviceId,
      err: String(err),
    });
    return [];
  }
}

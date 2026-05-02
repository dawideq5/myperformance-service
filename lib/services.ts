import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import {
  createServiceConversation,
  notifyServiceStatusChange,
} from "@/lib/chatwoot-customer";

const logger = log.child({ module: "services" });

export type ServiceStatus =
  | "received"
  | "diagnosing"
  | "awaiting_quote"
  | "repairing"
  | "testing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "archived";

export type ServiceType =
  | "phone"
  | "tablet"
  | "laptop"
  | "smartwatch"
  | "headphones"
  | "other";

export type TransportStatus =
  | "none"
  | "pickup_pending"
  | "in_transit_to_service"
  | "delivered_to_service"
  | "return_pending"
  | "in_transit_to_customer"
  | "delivered_to_customer";

export type LockType =
  | "none"
  | "pin"
  | "pattern"
  | "password"
  | "face"
  | "fingerprint"
  | "multi";

/** Checklista przyjęcia urządzenia — funkcjonalność + stan podstawowy. JSON w DB. */
export interface IntakeChecklist {
  /** "yes" | "no" | "vibrates" — czy urządzenie się włącza. */
  powers_on?: "yes" | "no" | "vibrates";
  /** Czy urządzenie jest wygięte. */
  bent?: boolean;
  /** Czy urządzenie ma pęknięty front. */
  cracked_front?: boolean;
  /** Czy urządzenie ma pęknięty tył. */
  cracked_back?: boolean;
  /** Tylko dla iPhone — czy Face ID / Touch ID działa. */
  face_touch_id?: boolean;
  /** "yes" | "no" | "unknown" — czy urządzenie było zalane. */
  water_damage?: "yes" | "no" | "unknown";
  /** Dodatkowe notatki technika. */
  notes?: string;
}

/** Marker uszkodzenia umieszczony klikiem na 3D modelu. */
export interface DamageMarker {
  id: string;
  /** Pozycja w przestrzeni 3D modelu telefonu. */
  x: number;
  y: number;
  z: number;
  /** Powierzchnia: front/back/frame/cameras. */
  surface?: string;
  description?: string;
  severity?: number; // 1-10
}

/** Wizualny stan urządzenia z 3D walkthrough. Wszystkie oceny 1-10. */
export interface VisualCondition {
  /** 1-10 ocena ekranu (1 = zniszczony, 10 = jak nowy). */
  display_rating?: number;
  display_notes?: string;
  /** 1-10 ocena tylnej szybki / obudowy. */
  back_rating?: number;
  back_notes?: string;
  /** 1-10 ocena wyspy aparatów (szkiełek + ramki). */
  camera_rating?: number;
  camera_notes?: string;
  /** 1-10 ocena ramek bocznych. */
  frames_rating?: number;
  frames_notes?: string;
  /** Markery uszkodzeń umieszczone na 3D modelu. */
  damage_markers?: DamageMarker[];
  additional_notes?: string;
  /** Potwierdzenie odbioru — czy klient pozostawił dodatkowe przedmioty.
   *   "none" = nic poza urządzeniem
   *   "items" = wpisane przedmioty (handover_items) */
  handover?: {
    choice: "none" | "items";
    items: string;
  };
  /** Status elektronicznego potwierdzenia (Documenso). Persistowane żeby
   * UI nie resetowało statusu do "brak" po refresh. */
  documenso?: {
    docId: number;
    /** Status flow:
     *  - sent: wysłany do pracownika do podpisu
     *  - employee_signed: pracownik podpisał, czeka na klienta
     *  - signed: klient podpisał (= COMPLETED)
     *  - paper_pending: pracownik podpisał elektronicznie, ścieżka papierowa,
     *    czeka na ręczny podpis klienta (klik Podpisano)
     *  - paper_signed: ścieżka papierowa zakończona (klient podpisał ręcznie)
     *  - rejected: ktoś odrzucił
     *  - expired: unieważniony (po edycji istotnej)
     */
    status:
      | "sent"
      | "employee_signed"
      | "signed"
      | "paper_pending"
      | "paper_signed"
      | "rejected"
      | "expired";
    sentAt: string;
    employeeSignedAt?: string;
    completedAt?: string;
    /** Sha256 wygenerowanego PDF — żeby porównać przy rebuild i wykryć
     * manipulację. */
    pdfHash?: string;
    /** Lista poprzednich docId-ów (po re-sign po istotnej edycji). */
    previousDocIds?: number[];
    /** Signing URL dla pracownika (z Documenso). Frontend embeduje/redirect. */
    employeeSigningUrl?: string;
    /** URL podpisanego dokumentu pobranego z Documenso po DOCUMENT_COMPLETED. */
    signedPdfUrl?: string;
  };
  /** Lokalny podpis pracownika (data:image/png;base64) embedowany w PDF
   * przed wysłaniem do Documenso/wydrukiem. Wymagany dla każdej generacji
   * potwierdzenia — zapewnia że pracownik świadomie autoryzował dokument. */
  employeeSignature?: {
    pngDataUrl: string;
    signedBy: string;
    signedAt: string;
  };
  /** Wersja papierowa podpisana ręcznie przez klienta. Po zaznaczeniu
   * elektroniczna ścieżka jest unieważniona w Documenso. */
  paperSigned?: {
    signedAt: string;
    signedBy: string;
    invalidatedDocId?: number;
  };
}

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  status: ServiceStatus;
  locationId: string | null;
  serviceLocationId: string | null;
  type: ServiceType | string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lockType: LockType;
  lockCode: string | null;
  signedInAccount: string | null;
  accessories: string[];
  intakeChecklist: IntakeChecklist;
  chargingCurrent: number | null;
  visualCondition: VisualCondition;
  description: string | null;
  diagnosis: string | null;
  amountEstimate: number | null;
  amountFinal: number | null;
  contactPhone: string | null;
  contactEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  photos: string[];
  receivedBy: string | null;
  assignedTechnician: string | null;
  transportStatus: TransportStatus;
  chatwootConversationId: number | null;
  warrantyUntil: string | null;
  promisedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ServiceRow {
  id: string;
  ticket_number: string;
  status: string | null;
  location: string | null;
  service_location: string | null;
  type: string | null;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  lock_type: string | null;
  lock_code: string | null;
  signed_in_account: string | null;
  accessories: string[] | string | null;
  intake_checklist: IntakeChecklist | string | null;
  charging_current: number | string | null;
  visual_condition: VisualCondition | string | null;
  description: string | null;
  diagnosis: string | null;
  amount_estimate: number | string | null;
  amount_final: number | string | null;
  contact_phone: string | null;
  contact_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  photos: string[] | string | null;
  received_by: string | null;
  assigned_technician: string | null;
  transport_status: string | null;
  chatwoot_conversation_id: number | null;
  warranty_until: string | null;
  promised_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStringArray(v: string[] | string | null): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.filter((x) => typeof x === "string");
    } catch {
      /* fall through */
    }
  }
  return [];
}

function parseChecklist(
  v: IntakeChecklist | string | null,
): IntakeChecklist {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return typeof p === "object" && p ? (p as IntakeChecklist) : {};
    } catch {
      return {};
    }
  }
  return v;
}

function parseVisualCondition(
  v: VisualCondition | string | null,
): VisualCondition {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return typeof p === "object" && p ? (p as VisualCondition) : {};
    } catch {
      return {};
    }
  }
  return v;
}

function mapRow(r: ServiceRow): ServiceTicket {
  return {
    id: r.id,
    ticketNumber: r.ticket_number,
    status: (r.status ?? "received") as ServiceStatus,
    locationId: r.location ?? null,
    serviceLocationId: r.service_location ?? null,
    type: r.type ?? null,
    brand: r.brand ?? null,
    model: r.model ?? null,
    imei: r.imei ?? null,
    color: r.color ?? null,
    lockType: (r.lock_type ?? "none") as LockType,
    lockCode: r.lock_code ?? null,
    signedInAccount: r.signed_in_account ?? null,
    accessories: parseStringArray(r.accessories),
    intakeChecklist: parseChecklist(r.intake_checklist),
    chargingCurrent: num(r.charging_current),
    visualCondition: parseVisualCondition(r.visual_condition),
    description: r.description ?? null,
    diagnosis: r.diagnosis ?? null,
    amountEstimate: num(r.amount_estimate),
    amountFinal: num(r.amount_final),
    contactPhone: r.contact_phone ?? null,
    contactEmail: r.contact_email ?? null,
    customerFirstName: r.customer_first_name ?? null,
    customerLastName: r.customer_last_name ?? null,
    photos: parseStringArray(r.photos),
    receivedBy: r.received_by ?? null,
    assignedTechnician: r.assigned_technician ?? null,
    transportStatus: (r.transport_status ?? "none") as TransportStatus,
    chatwootConversationId: r.chatwoot_conversation_id ?? null,
    warrantyUntil: r.warranty_until ?? null,
    promisedAt: r.promised_at ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Generuje ticket_number `SVC-YYYY-MM-NNNN` — szuka highest w bieżącym miesiącu. */
async function nextTicketNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `SVC-${yyyy}-${mm}-`;
  try {
    const rows = await listItems<{ ticket_number: string }>("mp_services", {
      "filter[ticket_number][_starts_with]": prefix,
      sort: "-ticket_number",
      limit: 1,
      fields: "ticket_number",
    });
    const last = rows[0]?.ticket_number ?? null;
    const lastSeq = last ? Number(last.slice(prefix.length)) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  } catch (err) {
    logger.warn("nextTicketNumber fallback", { err: String(err) });
    return `${prefix}${String(Date.now()).slice(-4)}`;
  }
}

export interface ListServicesQuery {
  /** Tylko zlecenia z tych lokalizacji (panel: locationIds usera). */
  locationIds?: string[];
  status?: ServiceStatus | ServiceStatus[];
  search?: string;
  /** Limit; default 100, max 500. */
  limit?: number;
  offset?: number;
}

export async function listServices(
  q: ListServicesQuery = {},
): Promise<ServiceTicket[]> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "-created_at",
    limit: Math.min(q.limit ?? 100, 500),
  };
  if (q.offset) query.offset = q.offset;
  if (q.locationIds?.length) {
    query["filter[_or][0][location][_in]"] = q.locationIds.join(",");
    query["filter[_or][1][service_location][_in]"] = q.locationIds.join(",");
  }
  if (q.status) {
    const arr = Array.isArray(q.status) ? q.status : [q.status];
    query["filter[status][_in]"] = arr.join(",");
  }
  if (q.search) {
    // Directus REST supports `search` for text-search on string columns.
    query.search = q.search;
  }
  try {
    const rows = await listItems<ServiceRow>("mp_services", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServices failed", { err: String(err) });
    return [];
  }
}

export async function getService(id: string): Promise<ServiceTicket | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<ServiceRow>("mp_services", {
      "filter[id][_eq]": id,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getService failed", { err: String(err) });
    return null;
  }
}

/** Znajduje service po Documenso documentId zapisanym w
 * visual_condition.documenso.docId. Używane w webhook handler do mapowania
 * podpisu klienta na service ticket. */
export async function findServiceByDocumensoId(
  docId: number | string,
): Promise<ServiceTicket | null> {
  if (!(await directusConfigured())) return null;
  const docIdNum = typeof docId === "string" ? Number(docId) : docId;
  if (!Number.isFinite(docIdNum)) return null;
  try {
    const rows = await listItems<ServiceRow>("mp_services", {
      sort: "-created_at",
      limit: 500,
    });
    const found = rows.find((r) => {
      const vc = (r.visual_condition ?? {}) as { documenso?: { docId?: number } };
      return vc.documenso?.docId === docIdNum;
    });
    return found ? mapRow(found) : null;
  } catch (err) {
    logger.warn("findServiceByDocumensoId failed", { err: String(err) });
    return null;
  }
}

export interface CreateServiceInput {
  locationId: string;
  serviceLocationId?: string | null;
  type?: ServiceType | string | null;
  brand?: string | null;
  model?: string | null;
  imei?: string | null;
  color?: string | null;
  lockType?: LockType;
  lockCode?: string | null;
  signedInAccount?: string | null;
  accessories?: string[];
  intakeChecklist?: IntakeChecklist;
  chargingCurrent?: number | null;
  visualCondition?: VisualCondition;
  description?: string | null;
  amountEstimate?: number | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  photos?: string[];
  promisedAt?: string | null;
  receivedBy: string;
}

export function validateService(
  input: Partial<CreateServiceInput>,
): string[] {
  const errors: string[] = [];
  if (!input.locationId) errors.push("Brak punktu sprzedaży (locationId)");
  if (!input.receivedBy) errors.push("Brak identyfikatora pracownika");
  if (!input.brand?.trim()) errors.push("Marka urządzenia jest wymagana");
  if (!input.model?.trim()) errors.push("Model urządzenia jest wymagany");
  if (!input.customerFirstName?.trim())
    errors.push("Imię klienta jest wymagane");
  if (!input.customerLastName?.trim())
    errors.push("Nazwisko klienta jest wymagane");
  if (!input.contactPhone?.trim())
    errors.push("Telefon kontaktowy klienta jest wymagany");
  // IMEI: dokładnie 15 cyfr (standard 3GPP) lub 17 dla MEID extended.
  // Inne urządzenia (laptop, tablet bez modemu) mogą nie mieć IMEI —
  // dlatego optional, ale gdy podany musi być prawidłowy.
  if (input.imei && input.imei.trim()) {
    const cleaned = input.imei.replace(/\D/g, "");
    if (cleaned.length !== 15 && cleaned.length !== 17) {
      errors.push("Numer IMEI musi mieć 15 cyfr (lub 17 dla MEID)");
    }
  }
  if (
    input.contactEmail &&
    input.contactEmail.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.contactEmail.trim())
  ) {
    errors.push("Niepoprawny format adresu email klienta");
  }
  if (input.contactPhone && input.contactPhone.trim()) {
    const digits = input.contactPhone.replace(/\D/g, "");
    if (digits.length < 9) {
      errors.push("Telefon kontaktowy musi zawierać co najmniej 9 cyfr");
    }
  }
  if (
    input.amountEstimate != null &&
    (!Number.isFinite(input.amountEstimate) || input.amountEstimate < 0)
  ) {
    errors.push(
      "Kwota wyceny musi być liczbą nieujemną (lub puste, gdy brak wyceny)",
    );
  }
  return errors;
}

export async function createService(
  input: CreateServiceInput,
): Promise<ServiceTicket> {
  const errors = validateService(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const ticketNumber = await nextTicketNumber();
  const now = new Date().toISOString();
  const created = await createItem<ServiceRow>("mp_services", {
    ticket_number: ticketNumber,
    status: "received",
    location: input.locationId,
    service_location: input.serviceLocationId ?? null,
    type: input.type ?? null,
    brand: input.brand ?? null,
    model: input.model ?? null,
    imei: input.imei ? input.imei.toUpperCase() : null,
    color: input.color ?? null,
    lock_type: input.lockType ?? "none",
    lock_code: input.lockCode ?? null,
    signed_in_account: input.signedInAccount ?? null,
    accessories: input.accessories ?? [],
    intake_checklist: input.intakeChecklist ?? {},
    charging_current: input.chargingCurrent ?? null,
    visual_condition: input.visualCondition ?? {},
    description: input.description ?? null,
    amount_estimate: input.amountEstimate ?? null,
    contact_phone: input.contactPhone ?? null,
    contact_email: input.contactEmail ?? null,
    customer_first_name: input.customerFirstName ?? null,
    customer_last_name: input.customerLastName ?? null,
    photos: (input.photos ?? []).slice(0, 10),
    received_by: input.receivedBy,
    transport_status: "none",
    promised_at: input.promisedAt ?? null,
    created_at: now,
    updated_at: now,
  });

  // Best-effort: utwórz konwersację Chatwoot (no-op gdy CHATWOOT_SERVICE_INBOX_ID
  // nie ustawione). Łapiemy errory żeby nie blokować creation.
  if (input.contactPhone || input.contactEmail) {
    try {
      const conversationId = await createServiceConversation({
        ticketNumber,
        customerName:
          [input.customerFirstName, input.customerLastName]
            .filter(Boolean)
            .join(" ") || "Klient",
        customerPhone: input.contactPhone ?? null,
        customerEmail: input.contactEmail ?? null,
        brand: input.brand ?? null,
        model: input.model ?? null,
        description: input.description ?? null,
      });
      if (conversationId && created.id) {
        await updateItem<ServiceRow>("mp_services", created.id, {
          chatwoot_conversation_id: conversationId,
          updated_at: new Date().toISOString(),
        });
        created.chatwoot_conversation_id = conversationId;
      }
    } catch (err) {
      logger.warn("Chatwoot conversation create failed", { err: String(err) });
    }
  }

  return mapRow(created);
}

export interface UpdateServiceInput {
  status?: ServiceStatus;
  diagnosis?: string | null;
  description?: string | null;
  amountEstimate?: number | null;
  amountFinal?: number | null;
  assignedTechnician?: string | null;
  transportStatus?: TransportStatus;
  chatwootConversationId?: number | null;
  promisedAt?: string | null;
  warrantyUntil?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  photos?: string[];
  serviceLocationId?: string | null;
  type?: ServiceType | string | null;
  brand?: string | null;
  model?: string | null;
  imei?: string | null;
  color?: string | null;
  lockType?: LockType;
  lockCode?: string | null;
  signedInAccount?: string | null;
  accessories?: string[];
  intakeChecklist?: IntakeChecklist;
  chargingCurrent?: number | null;
  visualCondition?: VisualCondition;
}

/** Atomic merge dla pola JSONB. Klucze z `input` nakładają się na `base`,
 * z jednym wyjątkiem: wartość `null` lub `undefined` usuwa klucz z output
 * (w bazie nie zostanie nawet tombstone). Pozwala na atomic delete pól
 * bez race condition (np. invalidacja employeeSignature po edycji
 * istotnej). */
function mergeJsonb(
  base: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) {
      delete out[k];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Dozwolone tranzycje statusu serwisu. Cykl pracy:
 * received → diagnosing → awaiting_quote → repairing → testing → ready → delivered.
 * Z każdego stanu można też anulować (cancelled) lub zarchiwizować (archived).
 * Cofanie nie jest dozwolone — zapobiega kasowaniu pracy serwisanta przez
 * przypadkowe kliknięcie sprzedawcy. */
const STATUS_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  received: ["diagnosing", "awaiting_quote", "repairing", "cancelled", "archived"],
  diagnosing: ["awaiting_quote", "repairing", "cancelled", "archived"],
  awaiting_quote: ["repairing", "cancelled", "archived"],
  repairing: ["testing", "ready", "cancelled", "archived"],
  testing: ["ready", "repairing", "cancelled", "archived"],
  ready: ["delivered", "archived"],
  delivered: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export class StatusTransitionError extends Error {
  constructor(
    public readonly from: ServiceStatus,
    public readonly to: ServiceStatus,
  ) {
    super(`Niedozwolone przejście statusu: ${from} → ${to}`);
    this.name = "StatusTransitionError";
  }
}

export function isAllowedTransition(
  from: ServiceStatus,
  to: ServiceStatus,
): boolean {
  if (from === to) return true;
  return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
): Promise<ServiceTicket> {
  // Pre-fetch — potrzebny do walidacji statusu, conversation_id, oraz do
  // atomic-merge JSONB (visualCondition / intakeChecklist). Robimy go
  // ZAWSZE gdy input dotyka pola JSONB (zapobiega overwrite races między
  // równoległym PATCH-em a documenso webhook'iem).
  const needsBefore =
    input.status !== undefined ||
    input.visualCondition !== undefined ||
    input.intakeChecklist !== undefined;
  const before = needsBefore ? await getService(id) : null;
  if (
    before &&
    input.status !== undefined &&
    !isAllowedTransition(before.status as ServiceStatus, input.status as ServiceStatus)
  ) {
    throw new StatusTransitionError(
      before.status as ServiceStatus,
      input.status as ServiceStatus,
    );
  }
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.diagnosis !== undefined) patch.diagnosis = input.diagnosis;
  if (input.amountEstimate !== undefined)
    patch.amount_estimate = input.amountEstimate;
  if (input.amountFinal !== undefined) patch.amount_final = input.amountFinal;
  if (input.assignedTechnician !== undefined)
    patch.assigned_technician = input.assignedTechnician;
  if (input.transportStatus !== undefined)
    patch.transport_status = input.transportStatus;
  if (input.chatwootConversationId !== undefined)
    patch.chatwoot_conversation_id = input.chatwootConversationId;
  if (input.promisedAt !== undefined) patch.promised_at = input.promisedAt;
  if (input.warrantyUntil !== undefined)
    patch.warranty_until = input.warrantyUntil;
  if (input.customerFirstName !== undefined)
    patch.customer_first_name = input.customerFirstName;
  if (input.customerLastName !== undefined)
    patch.customer_last_name = input.customerLastName;
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.photos !== undefined) patch.photos = input.photos.slice(0, 10);
  if (input.serviceLocationId !== undefined)
    patch.service_location = input.serviceLocationId;
  if (input.type !== undefined) patch.type = input.type;
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.model !== undefined) patch.model = input.model;
  if (input.imei !== undefined)
    patch.imei = input.imei ? input.imei.toUpperCase() : null;
  if (input.color !== undefined) patch.color = input.color;
  if (input.description !== undefined) patch.description = input.description;
  if (input.lockType !== undefined) patch.lock_type = input.lockType;
  if (input.lockCode !== undefined) patch.lock_code = input.lockCode;
  if (input.signedInAccount !== undefined)
    patch.signed_in_account = input.signedInAccount;
  if (input.accessories !== undefined) patch.accessories = input.accessories;
  if (input.intakeChecklist !== undefined) {
    const baseCk = (before?.intakeChecklist ?? {}) as Record<string, unknown>;
    patch.intake_checklist = mergeJsonb(baseCk, input.intakeChecklist as Record<string, unknown>);
  }
  if (input.chargingCurrent !== undefined)
    patch.charging_current = input.chargingCurrent;
  if (input.visualCondition !== undefined) {
    const baseVc = (before?.visualCondition ?? {}) as Record<string, unknown>;
    patch.visual_condition = mergeJsonb(baseVc, input.visualCondition as Record<string, unknown>);
  }
  const updated = await updateItem<ServiceRow>("mp_services", id, patch);
  const mapped = mapRow(updated);

  // Powiadom klienta o zmianie statusu (best-effort, no-op gdy Chatwoot
  // nieconfigurowany albo brak conversation_id).
  if (
    before &&
    input.status !== undefined &&
    before.status !== input.status
  ) {
    try {
      await notifyServiceStatusChange({
        conversationId: mapped.chatwootConversationId,
        ticketNumber: mapped.ticketNumber,
        newStatus: input.status,
      });
    } catch (err) {
      logger.warn("Chatwoot notify failed", { err: String(err) });
    }
  }

  return mapped;
}

export async function deleteService(id: string): Promise<void> {
  await deleteItem("mp_services", id);
}

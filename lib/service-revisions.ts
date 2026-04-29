import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";
import type { ServiceTicket, UpdateServiceInput } from "@/lib/services";

const logger = log.child({ module: "service-revisions" });

export type ChangeKind = "edit" | "status_change" | "annex_issued" | "documenso";

export interface ServiceRevision {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  editedByEmail: string | null;
  editedByName: string | null;
  changeKind: ChangeKind;
  isSignificant: boolean;
  summary: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  createdAt: string;
}

interface RevisionRow {
  id: string;
  service_id: string;
  ticket_number: string | null;
  edited_by_email: string | null;
  edited_by_name: string | null;
  change_kind: ChangeKind;
  is_significant: boolean;
  summary: string;
  changes: unknown;
  created_at: string;
}

function mapRow(r: RevisionRow): ServiceRevision {
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    editedByEmail: r.edited_by_email,
    editedByName: r.edited_by_name,
    changeKind: r.change_kind,
    isSignificant: !!r.is_significant,
    summary: r.summary ?? "",
    changes: (r.changes ?? {}) as Record<string, { before: unknown; after: unknown }>,
    createdAt: r.created_at,
  };
}

/** Pola które wymagają aneksu — zmiana w nich oznacza nowe warunki dla
 * klienta i może wymagać re-podpisu / poinformowania. */
const SIGNIFICANT_FIELDS = new Set<keyof UpdateServiceInput>([
  "amountEstimate",
  "amountFinal",
  "diagnosis",
  "promisedAt",
  "warrantyUntil",
]);

const FIELD_LABEL: Partial<Record<keyof UpdateServiceInput, string>> = {
  status: "status",
  diagnosis: "diagnoza",
  amountEstimate: "kwota wyceny",
  amountFinal: "kwota finalna",
  promisedAt: "obiecana data",
  warrantyUntil: "gwarancja do",
  customerFirstName: "imię klienta",
  customerLastName: "nazwisko klienta",
  contactPhone: "telefon klienta",
  contactEmail: "email klienta",
  brand: "marka urządzenia",
  model: "model urządzenia",
  imei: "IMEI",
  color: "kolor",
  lockType: "typ blokady",
  lockCode: "kod blokady",
  visualCondition: "stan wizualny",
  intakeChecklist: "checklist przyjęcia",
  serviceLocationId: "punkt serwisowy",
  assignedTechnician: "przypisany serwisant",
};

/** Buduje diff między aktualnym service a UpdateServiceInput. Zwraca też
 * isSignificant=true gdy zmiana dotyczy któregokolwiek SIGNIFICANT_FIELDS. */
function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 60 ? t.slice(0, 57) + "…" : t || "—";
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Tak" : "Nie";
  // JSONB obiekty (visualCondition, intakeChecklist) — nie wstawiamy
  // surowego JSON do summary, tylko skrócony znacznik. UI history
  // może wyświetlić kluczowe pola osobno.
  if (typeof v === "object") return "[obiekt]";
  return String(v);
}

export function diffServiceUpdate(
  before: ServiceTicket,
  input: UpdateServiceInput,
): {
  changes: Record<string, { before: unknown; after: unknown }>;
  summary: string;
  isSignificant: boolean;
} {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const summaryParts: string[] = [];
  let isSignificant = false;

  for (const key of Object.keys(input) as (keyof UpdateServiceInput)[]) {
    const newVal = input[key];
    if (newVal === undefined) continue;
    const oldVal = (before as unknown as Record<string, unknown>)[key];
    if (deepEqual(oldVal, newVal)) continue;
    changes[key as string] = { before: oldVal, after: newVal };
    const label = FIELD_LABEL[key] ?? (key as string);
    // Konkretne wartości w summary — np. "kwota wyceny: 100 → 150 PLN".
    if (
      typeof newVal !== "object" &&
      typeof oldVal !== "object" &&
      key !== "visualCondition" &&
      key !== "intakeChecklist"
    ) {
      summaryParts.push(`${label}: ${fmtValue(oldVal)} → ${fmtValue(newVal)}`);
    } else {
      summaryParts.push(label);
    }
    if (SIGNIFICANT_FIELDS.has(key)) isSignificant = true;
  }

  return {
    changes,
    summary:
      summaryParts.length === 0
        ? "Brak zmian"
        : summaryParts.join(" • "),
    isSignificant,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export interface RecordRevisionInput {
  service: ServiceTicket;
  input: UpdateServiceInput;
  editor: { email: string; name: string };
  changeKind?: ChangeKind;
}

/** Zapisuje rewizję (audit log row) jeśli faktycznie są zmiany. Best-effort
 * — błąd zapisu nie powinien blokować update'u serwisu. */
export async function recordServiceRevision(
  input: RecordRevisionInput,
): Promise<ServiceRevision | null> {
  if (!(await directusConfigured())) return null;
  const { changes, summary, isSignificant } = diffServiceUpdate(
    input.service,
    input.input,
  );
  if (Object.keys(changes).length === 0) return null;

  const kind: ChangeKind =
    input.changeKind ??
    (input.input.status !== undefined && Object.keys(changes).length === 1
      ? "status_change"
      : "edit");

  try {
    const row = await createItem<RevisionRow>("mp_service_revisions", {
      service_id: input.service.id,
      ticket_number: input.service.ticketNumber ?? null,
      edited_by_email: input.editor.email,
      edited_by_name: input.editor.name,
      change_kind: kind,
      is_significant: isSignificant,
      summary,
      changes,
    });
    return mapRow(row);
  } catch (err) {
    logger.warn("recordServiceRevision failed", {
      serviceId: input.service.id,
      err: String(err),
    });
    return null;
  }
}

export async function listServiceRevisions(
  serviceId: string,
  limit = 100,
): Promise<ServiceRevision[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<RevisionRow>("mp_service_revisions", {
      "filter[service_id][_eq]": serviceId,
      sort: "-created_at",
      limit,
    });
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listServiceRevisions failed", { err: String(err) });
    return [];
  }
}

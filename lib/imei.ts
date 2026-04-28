/**
 * IMEI utilities: Luhn validation + service history lookup.
 *
 * IMEI to 15-cyfrowy numer; ostatnia cyfra to checksum Luhna. Algorytm:
 * - od prawej do lewej, podwajaj co drugą cyfrę (od pozycji 2)
 * - jeśli wynik podwojenia > 9, dodaj cyfry (eq. odejmij 9)
 * - suma wszystkich cyfr % 10 musi być 0
 *
 * IMEI 15 cyfr to standard. 14 cyfr = IMEI bez checksum (rzadko, ale bywa
 * przy starszych raportach) — akceptujemy też.
 */
import { listItems, isConfigured as directusConfigured } from "@/lib/directus-cms";

const IMEI_REGEX = /^[0-9]{14,15}$/;

export function isImeiFormat(imei: string): boolean {
  return IMEI_REGEX.test(imei.trim());
}

export function isValidImei(imei: string): boolean {
  const v = imei.trim();
  if (!IMEI_REGEX.test(v)) return false;
  if (v.length === 14) return true; // bez checksum — only format check
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = Number(v[14 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export interface ServiceHistoryItem {
  id: string;
  ticketNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  diagnosis: string | null;
  amountFinal: number | null;
  amountEstimate: number | null;
  createdAt: string | null;
}

interface MinimalRow {
  id: string;
  ticket_number: string;
  status: string | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  diagnosis: string | null;
  amount_final: number | string | null;
  amount_estimate: number | string | null;
  created_at: string | null;
}

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Zwraca poprzednie zlecenia dla tego IMEI (sortowane malejąco po dacie). */
export async function getServiceHistoryByImei(
  imei: string,
  excludeId?: string,
): Promise<ServiceHistoryItem[]> {
  if (!(await directusConfigured())) return [];
  const normalized = imei.trim().toUpperCase();
  if (!isImeiFormat(normalized)) return [];
  try {
    const rows = await listItems<MinimalRow>("mp_services", {
      "filter[imei][_eq]": normalized,
      sort: "-created_at",
      limit: 50,
      fields:
        "id,ticket_number,status,brand,model,description,diagnosis,amount_final,amount_estimate,created_at",
    });
    return rows
      .filter((r) => !excludeId || r.id !== excludeId)
      .map((r) => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        status: r.status ?? "received",
        brand: r.brand ?? null,
        model: r.model ?? null,
        description: r.description ?? null,
        diagnosis: r.diagnosis ?? null,
        amountFinal: num(r.amount_final),
        amountEstimate: num(r.amount_estimate),
        createdAt: r.created_at ?? null,
      }));
  } catch {
    return [];
  }
}

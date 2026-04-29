/** Otwiera PDF potwierdzenia w nowej karcie. PDF generowany SERVER-SIDE
 * przez @react-pdf/renderer (dashboard /api/panel/services/{id}/receipt).
 * Browser native renderuje PDF inline (Content-Type: application/pdf,
 * Content-Disposition: inline). Brak html2canvas, brak download. */

export interface ReceiptHandoverInfo {
  choice: "none" | "items";
  items: string;
}

/** Otwiera potwierdzenie w nowej karcie. handover info opcjonalne — gdy
 * podane (świeżo utworzone zlecenie), idzie do serwera jako query.
 * Bez handover (re-print z listy) defaults to "none". */
export function openServiceReceipt(
  serviceId: string,
  handover?: ReceiptHandoverInfo,
): void {
  const params = new URLSearchParams();
  if (handover) {
    params.set("handover_choice", handover.choice);
    if (handover.items) params.set("handover_items", handover.items);
  }
  // Cache-buster — Safari potrafi cachować PDF mimo no-store; każdy klik
  // unikalny URL → fresh fetch.
  params.set("_t", String(Date.now()));
  const url = `/api/relay/services/${encodeURIComponent(serviceId)}/receipt?${params.toString()}`;
  window.open(url, "_blank");
}

/** Wysyła potwierdzenie elektroniczne via Documenso. Pracownik + klient
 * dostają email z linkiem do podpisu. Webhook update'uje status po
 * complete. */
export async function sendElectronicReceipt(
  serviceId: string,
  handover?: ReceiptHandoverInfo,
): Promise<{
  ok: boolean;
  documentId?: number;
  signingUrls?: Array<{ email: string; url: string | null }>;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (handover) {
    params.set("handover_choice", handover.choice);
    if (handover.items) params.set("handover_items", handover.items);
  }
  const qs = params.toString();
  const url = `/api/relay/services/${encodeURIComponent(serviceId)}/send-electronic${qs ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error ?? json?.detail ?? `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      documentId: json.documentId,
      signingUrls: json.signingUrls,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

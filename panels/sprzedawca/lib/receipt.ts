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
  const qs = params.toString();
  const url = `/api/relay/services/${encodeURIComponent(serviceId)}/receipt${qs ? `?${qs}` : ""}`;
  window.open(url, "_blank");
}

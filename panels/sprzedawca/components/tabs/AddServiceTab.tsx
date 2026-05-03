"use client";

/**
 * Wave 22 / F12 — thin wrapper over AddServiceForm.
 *
 * Cała logika formularza przyjęcia mieszka teraz w
 * `panels/sprzedawca/components/intake/AddServiceForm.tsx` (zduplikowane
 * w `panels/serwisant/components/intake/AddServiceForm.tsx` — patrz F12-SYNC
 * komentarz w nagłówku każdego z plików). Sprzedawca renderuje go w
 * mode="sales" + przekazuje sales-specific dependencies (toast.push przez
 * onError, openServiceReceipt/sendElectronicReceipt jako receiptHandlers).
 *
 * Domyślny post-submit flow w mode="sales" to redirect do `/serwis/${id}`,
 * więc parent `PanelHome` nie musi przekazywać `onCreated`.
 */

import { AddServiceForm } from "../intake/AddServiceForm";
import {
  openServiceReceipt,
  sendElectronicReceipt,
} from "../../lib/receipt";
import { useToast } from "../ToastProvider";

export function AddServiceTab({
  locationId,
  editingServiceId,
  onEditDone,
}: {
  locationId: string;
  editingServiceId?: string | null;
  onEditDone?: () => void;
}) {
  const toast = useToast();
  return (
    <AddServiceForm
      mode="sales"
      locationId={locationId}
      editingServiceId={editingServiceId}
      onEditDone={onEditDone}
      onError={({ title, message }) =>
        toast.push({ kind: "error", title, message })
      }
      receiptHandlers={{
        openReceipt: openServiceReceipt,
        sendElectronicReceipt: async (id, handover) => {
          const r = await sendElectronicReceipt(id, handover);
          return {
            ok: r.ok,
            documentId: r.documentId,
            error: r.error,
          };
        },
      }}
    />
  );
}

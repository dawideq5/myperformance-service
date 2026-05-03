/**
 * Wave 22 / F8 — guardy unieważniania potwierdzeń odbioru.
 *
 * Race-condition guard: gdy klient już podpisał (lub ścieżka papierowa
 * została potwierdzona), albo zlecenie wyszło poza status `received`
 * (przyjęte na serwis), unieważnianie jest zablokowane. Sprzedawca nie
 * może wycofać dokumentu w trakcie procesu naprawczego.
 *
 * Override: realm-admin / superadmin może wymusić unieważnienie przez
 * `?force=true` — wymagany audit log z `force: true` w payload.
 */
import type { ServiceTicket } from "@/lib/services";
import { hasSuperadminRole } from "@/lib/permissions/superadmin";

export type InvalidateKind = "electronic" | "paper";

export interface InvalidateGuardCheck {
  /** Czy guard pozwala na unieważnienie (bez force). */
  allowed: boolean;
  /** Czy realm-admin może wymusić mimo blokady. */
  canForce: boolean;
  /** Powód blokady (PL, gotowy do wyświetlenia w UI / API response). */
  reason: string | null;
  /** Stabilny kod blokady — UI/test może warunkować. */
  code: "ok" | "service_in_progress" | "client_signed" | "paper_signed" | "no_document";
}

/**
 * Czy zlecenie wyszło poza status "received" (nie wolno unieważniać po
 * przyjęciu na diagnozę / naprawę / etc.). Status `received` to jedyny
 * dopuszczalny stan dla unieważnienia.
 */
function isServiceLocked(status: ServiceTicket["status"]): boolean {
  return status !== "received";
}

/**
 * Check guards dla unieważnienia. Pure function — nie pisze do DB.
 * Caller robi `if (!allowed && (!canForce || !force)) return 403`.
 */
export function checkInvalidateGuard(
  service: ServiceTicket,
  kind: InvalidateKind,
  realmRoles: readonly string[],
): InvalidateGuardCheck {
  const canForce = hasSuperadminRole(realmRoles);
  const docu = service.visualCondition?.documenso;
  const paper = service.visualCondition?.paperSigned;

  // Nic do unieważnienia — wczesny exit (UI nie powinno pokazać przycisku).
  if (kind === "electronic" && !docu?.docId) {
    return {
      allowed: false,
      canForce: false, // brak dokumentu → nawet admin nie ma czego unieważnić
      reason: "Brak dokumentu elektronicznego do unieważnienia",
      code: "no_document",
    };
  }
  if (kind === "paper" && !paper && !docu?.docId) {
    return {
      allowed: false,
      canForce: false,
      reason: "Brak ścieżki papierowej do unieważnienia",
      code: "no_document",
    };
  }

  // Race condition #1 — klient podpisał elektronicznie. To jest finalny
  // stan z punktu widzenia podpisu (Documenso COMPLETED). Sprzedawca nie
  // może go wycofać po fakcie.
  if (kind === "electronic" && docu?.status === "signed") {
    return {
      allowed: false,
      canForce,
      reason:
        "Klient już podpisał ten dokument elektronicznie — nie można go unieważnić.",
      code: "client_signed",
    };
  }

  // Race condition #2 — ścieżka papierowa jest oznaczona jako podpisana
  // (klient podpisał wydruk i pracownik kliknął "Podpisano"). Final state.
  if (kind === "paper" && paper) {
    return {
      allowed: false,
      canForce,
      reason:
        "Klient już podpisał wersję papierową — nie można jej unieważnić.",
      code: "paper_signed",
    };
  }

  // Race condition #3 — zlecenie wyszło poza `received` (przyjęte na
  // serwis). Nawet jeśli dokument jeszcze nie podpisany, sprzedawca nie
  // powinien już manipulować potwierdzeniem przyjęcia — serwisant pracuje
  // nad urządzeniem.
  if (isServiceLocked(service.status)) {
    return {
      allowed: false,
      canForce,
      reason:
        "Nie można unieważnić dokumentu po przyjęciu zlecenia na serwis.",
      code: "service_in_progress",
    };
  }

  return { allowed: true, canForce, reason: null, code: "ok" };
}

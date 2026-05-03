import { describe, it, expect } from "vitest";
import { checkInvalidateGuard } from "@/lib/services/invalidate-guards";
import type { ServiceTicket } from "@/lib/services";

/**
 * Wave 22 / F8 — testy guardów unieważniania dokumentów.
 *
 * Cel: zagwarantować że po podpisaniu dokumentu lub po przyjęciu zlecenia
 * na serwis sprzedawca nie może go unieważnić (race-condition guard),
 * oraz że realm-admin może wymusić przez `force` (canForce flag).
 */

const ROLES_USER: readonly string[] = ["app_user"];
const ROLES_ADMIN: readonly string[] = ["app_user", "admin"];

function baseService(
  overrides: Partial<ServiceTicket> = {},
): ServiceTicket {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    ticketNumber: "T-001",
    status: "received",
    locationId: "L1",
    serviceLocationId: "L1",
    type: null,
    brand: null,
    model: null,
    imei: null,
    color: null,
    lockType: null as ServiceTicket["lockType"],
    lockCode: null,
    signedInAccount: null,
    accessories: [],
    intakeChecklist: {} as ServiceTicket["intakeChecklist"],
    chargingCurrent: null,
    visualCondition: {},
    description: null,
    diagnosis: null,
    amountEstimate: null,
    amountFinal: null,
    contactPhone: null,
    contactEmail: null,
    customerFirstName: null,
    customerLastName: null,
    photos: [],
    receivedBy: null,
    assignedTechnician: null,
    transportStatus: null as ServiceTicket["transportStatus"],
    chatwootConversationId: null,
    warrantyUntil: null,
    promisedAt: null,
    createdAt: null,
    updatedAt: null,
    previousStatus: null,
    holdReason: null,
    cancellationReason: null,
    ...overrides,
  };
}

describe("checkInvalidateGuard", () => {
  describe("electronic", () => {
    it("blocks when no document exists (early exit)", () => {
      const s = baseService({ visualCondition: {} });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("no_document");
      expect(r.canForce).toBe(false);
    });

    it("allows when document is in `sent` state and service is `received`", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          documenso: { docId: 42, status: "sent", sentAt: "2026-05-01T10:00:00Z" },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.allowed).toBe(true);
      expect(r.code).toBe("ok");
    });

    it("blocks when client signed (status === 'signed')", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("client_signed");
      expect(r.canForce).toBe(false); // user nie ma admin
      expect(r.reason).toMatch(/podpisał/i);
    });

    it("admin canForce when client signed", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_ADMIN);
      expect(r.allowed).toBe(false); // wciąż blocked dla zwykłego flow
      expect(r.canForce).toBe(true); // ale admin może wymusić
    });

    it("blocks when service is past 'received' (e.g., diagnosing)", () => {
      const s = baseService({
        status: "diagnosing",
        visualCondition: {
          documenso: { docId: 42, status: "sent", sentAt: "2026-05-01T10:00:00Z" },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("service_in_progress");
      expect(r.reason).toMatch(/przyjęciu/i);
    });

    it.each([
      "diagnosing",
      "awaiting_quote",
      "awaiting_parts",
      "repairing",
      "testing",
      "ready",
      "delivered",
      "closed",
      "cancelled",
    ] as const)("blocks for status=%s", (status) => {
      const s = baseService({
        status,
        visualCondition: {
          documenso: { docId: 42, status: "sent", sentAt: "2026-05-01T10:00:00Z" },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.allowed).toBe(false);
    });

    it("client_signed takes precedence over service_in_progress", () => {
      // gdy oba blokują, kod wskazuje silniejszy powód (client_signed)
      const s = baseService({
        status: "diagnosing",
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ROLES_USER);
      expect(r.code).toBe("client_signed");
    });
  });

  describe("paper", () => {
    it("blocks when no paper or document exists", () => {
      const s = baseService({ visualCondition: {} });
      const r = checkInvalidateGuard(s, "paper", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("no_document");
    });

    it("allows when paper_pending (electronic doc with paper status) on received", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          documenso: {
            docId: 42,
            status: "paper_pending",
            sentAt: "2026-05-01T10:00:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "paper", ROLES_USER);
      expect(r.allowed).toBe(true);
    });

    it("blocks when paperSigned set", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          paperSigned: {
            signedAt: "2026-05-01T10:30:00Z",
            signedBy: "user@example.com",
          },
        },
      });
      const r = checkInvalidateGuard(s, "paper", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("paper_signed");
      expect(r.canForce).toBe(false);
    });

    it("admin canForce when paperSigned", () => {
      const s = baseService({
        status: "received",
        visualCondition: {
          paperSigned: {
            signedAt: "2026-05-01T10:30:00Z",
            signedBy: "user@example.com",
          },
        },
      });
      const r = checkInvalidateGuard(s, "paper", ROLES_ADMIN);
      expect(r.allowed).toBe(false);
      expect(r.canForce).toBe(true);
    });

    it("blocks when service is past 'received'", () => {
      const s = baseService({
        status: "repairing",
        visualCondition: {
          documenso: {
            docId: 42,
            status: "paper_pending",
            sentAt: "2026-05-01T10:00:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "paper", ROLES_USER);
      expect(r.allowed).toBe(false);
      expect(r.code).toBe("service_in_progress");
    });
  });

  describe("realm-admin role variants", () => {
    it("realm-admin role grants canForce", () => {
      const s = baseService({
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ["realm-admin"]);
      expect(r.canForce).toBe(true);
    });

    it("manage-realm role grants canForce", () => {
      const s = baseService({
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", ["manage-realm"]);
      expect(r.canForce).toBe(true);
    });

    it("regular roles do NOT grant canForce", () => {
      const s = baseService({
        visualCondition: {
          documenso: {
            docId: 42,
            status: "signed",
            sentAt: "2026-05-01T10:00:00Z",
            completedAt: "2026-05-01T10:30:00Z",
          },
        },
      });
      const r = checkInvalidateGuard(s, "electronic", [
        "app_user",
        "panel-sprzedawca_sales",
      ]);
      expect(r.canForce).toBe(false);
    });
  });
});

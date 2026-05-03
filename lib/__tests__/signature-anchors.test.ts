import { describe, it, expect } from "vitest";
import {
  getAnchorsForKind,
  getAnchorsForReceipt,
  getAnchorsForAnnex,
  getAnchorsForHandover,
  getAnchorsForReleaseCode,
  getAnchorsForWarranty,
  mapAnchorsToDocumensoFields,
} from "@/lib/services/signature-anchors";

const PAGE_W = 595.28;
const PAGE_H = 841.89;

describe("signature-anchors", () => {
  describe("getAnchorsForKind dispatcher", () => {
    it.each([
      ["receipt", 4],
      ["annex", 4],
      ["handover", 4],
      ["release_code", 4],
      ["warranty", 2],
      ["other", 0],
    ] as const)("returns expected count for kind=%s", (kind, count) => {
      expect(getAnchorsForKind(kind)).toHaveLength(count);
    });
  });

  describe("anchor invariants", () => {
    const all = [
      ["receipt", getAnchorsForReceipt()],
      ["annex", getAnchorsForAnnex()],
      ["handover", getAnchorsForHandover()],
      ["release_code", getAnchorsForReleaseCode()],
      ["warranty", getAnchorsForWarranty()],
    ] as const;

    it.each(all)("%s anchors mieszczą się na stronie A4", (_kind, anchors) => {
      for (const a of anchors) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(PAGE_W);
        expect(a.y + a.height).toBeLessThanOrEqual(PAGE_H);
        expect(a.page).toBe(0); // wszystkie aktualnie na 1szej stronie
      }
    });

    it.each(all)("%s ma signature dla wymaganych ról", (kind, anchors) => {
      const signatures = anchors.filter((a) => a.kind === "signature");
      expect(signatures.length).toBeGreaterThanOrEqual(1);
      const employeeSig = signatures.find((a) => a.role === "employee");
      expect(employeeSig).toBeDefined();
      // Warranty: tylko employee (klient nie podpisuje karty gwarancji)
      if (kind !== "warranty") {
        const customerSig = signatures.find((a) => a.role === "customer");
        expect(customerSig).toBeDefined();
      }
    });

    it.each(all)("%s ma date dla każdej signature role", (_kind, anchors) => {
      const signatureRoles = new Set(
        anchors.filter((a) => a.kind === "signature").map((a) => a.role),
      );
      const dateRoles = new Set(
        anchors.filter((a) => a.kind === "date").map((a) => a.role),
      );
      for (const role of signatureRoles) {
        expect(dateRoles.has(role)).toBe(true);
      }
    });
  });

  describe("mapAnchorsToDocumensoFields", () => {
    it("przelicza pkt PDF na procenty strony", () => {
      const anchors = getAnchorsForReceipt();
      const fields = mapAnchorsToDocumensoFields(
        anchors,
        { employee: 0, customer: 1 },
        PAGE_W,
        PAGE_H,
      );
      expect(fields).toHaveLength(4);
      for (const f of fields) {
        expect(f.pageX).toBeGreaterThanOrEqual(0);
        expect(f.pageX).toBeLessThanOrEqual(100);
        expect(f.pageY).toBeGreaterThanOrEqual(0);
        expect(f.pageY).toBeLessThanOrEqual(100);
        expect(f.pageWidth).toBeGreaterThanOrEqual(0);
        expect(f.pageHeight).toBeGreaterThanOrEqual(0);
        expect(f.pageNumber).toBe(1); // 1-based
      }
    });

    it("pomija anchory bez signerIndex (np. employee tylko)", () => {
      const anchors = getAnchorsForReceipt();
      const fields = mapAnchorsToDocumensoFields(
        anchors,
        { employee: 0 }, // brak customer mapping
        PAGE_W,
        PAGE_H,
      );
      // 2 employee fields (signature + date), 0 customer
      expect(fields).toHaveLength(2);
      expect(fields.every((f) => f.signerIndex === 0)).toBe(true);
    });

    it("typ pola: signature → SIGNATURE, date → DATE", () => {
      const anchors = getAnchorsForReceipt();
      const fields = mapAnchorsToDocumensoFields(
        anchors,
        { employee: 0, customer: 1 },
        PAGE_W,
        PAGE_H,
      );
      expect(fields.filter((f) => f.type === "SIGNATURE")).toHaveLength(2);
      expect(fields.filter((f) => f.type === "DATE")).toHaveLength(2);
    });
  });
});

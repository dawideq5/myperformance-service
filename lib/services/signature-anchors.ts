/**
 * Wave 21 / Faza 1B — mapa pól podpisu/daty per rodzaj dokumentu.
 *
 * Każdy generowany przez nas PDF (potwierdzenie przyjęcia, aneks, protokół
 * wydania, ...) ma stabilny układ — sekcja sygnatariuszy znajduje się w
 * przewidywalnych pozycjach. Ten helper zwraca listę "anchors" (X/Y/W/H w
 * jednostkach pkt PDF, page indeks 0-based, role + kind), które:
 *
 *  - są zapisywane w `mp_service_documents.signature_anchors` (JSONB),
 *  - przekładamy na Documenso v3 fields API (`POST /api/v1/documents/{id}/fields`)
 *    przy wysyłce dokumentu do podpisu,
 *  - mogą być użyte w UI overlay (podgląd podpisu w bibliotece dokumentów).
 *
 * Konwencja jednostek:
 *  - `x`, `y`, `width`, `height` w punktach PDF (1 pt = 1/72 cala).
 *  - origin = top-left strony PDFKit-owej (zgodnie z naszą konwencją w
 *    receipt-pdf.ts / annex-pdf.ts), strona A4 = 595.28 × 841.89 pt.
 *  - `page` = 0-based; Documenso v3 oczekuje 1-based pageNumber, mapowanie
 *    robi `mapAnchorsToDocumensoFields()` poniżej.
 *
 * Każdy rodzaj dokumentu ma 2 zestawy anchorów (employee + customer) —
 * po 1 polu SIGNATURE i 1 DATE per strona.
 */

export type SignatureAnchorRole = "employee" | "customer";
export type SignatureAnchorKind = "signature" | "date" | "text";

export interface SignatureAnchor {
  role: SignatureAnchorRole;
  /** 0-based index strony w PDF. */
  page: number;
  /** Lewa krawędź pola w pkt PDF (origin top-left). */
  x: number;
  /** Górna krawędź pola w pkt PDF (origin top-left). */
  y: number;
  width: number;
  height: number;
  kind: SignatureAnchorKind;
}

// Stałe wynikają 1:1 z układu generowanego w `lib/receipt-pdf.ts` i
// `lib/annex-pdf.ts` (margin M=24 pt, sekcja podpisów lewa/prawa kolumna,
// SIG_HEIGHT=32-34 pt, separator 24 pt). Zmiana tych stałych w PDF helperach
// wymaga równoległego update'u tutaj — testy snapshotowe layoutów PDF (TBD).
const PAGE_W = 595.28;
const _PAGE_H = 841.89; // referencja dla pełnej strony — używamy w komentarzach
const M = 24;
const W = PAGE_W - 2 * M; // 547.28
const SIG_W = (W - 24) / 2; // 261.64

/**
 * Anchors dla potwierdzenia przyjęcia (lib/receipt-pdf.ts).
 *
 * Sekcja podpisów leży na dole strony 1 — pracownik po lewej, klient po
 * prawej. W receipt-pdf SIG_HEIGHT=34, sekcja zaczyna się ~y=590 (po
 * regulaminie + handover bloku). Konkretne X/Y wyliczone na podstawie
 * `drawSinglePage` (y po HANDOVER ≈ 600, sigBoxY = sigTopY - 8).
 */
export function getAnchorsForReceipt(): SignatureAnchor[] {
  // Odpowiada `sigTopY` w receipt-pdf przed SIG_LIFT_PT — wybieramy
  // konserwatywnie y=600 (środek strefy podpisu) i height=34. Documenso
  // wyśrodkowuje signature w polu, więc lekkie offsety są tolerowane.
  const SIG_TOP_Y = 600;
  const SIG_HEIGHT = 34;
  return [
    {
      role: "employee",
      page: 0,
      x: M, // lewa kolumna
      y: SIG_TOP_Y - 8, // SIG_LIFT_PT
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "employee",
      page: 0,
      x: M,
      y: SIG_TOP_Y + SIG_HEIGHT + 16,
      width: SIG_W * 0.5,
      height: 14,
      kind: "date",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24, // prawa kolumna (gap=24)
      y: SIG_TOP_Y - 8,
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24,
      y: SIG_TOP_Y + SIG_HEIGHT + 16,
      width: SIG_W * 0.5,
      height: 14,
      kind: "date",
    },
  ];
}

/**
 * Anchors dla aneksu (lib/annex-pdf.ts).
 *
 * Aneks ma sekcję STRONY ANEKSU — 2 kolumny, podpisy na dole pod tabelami
 * danych. SIG_HEIGHT=32. W annex-pdf sigTopY = y po sekcji STRONY ANEKSU
 * (`y += 80`) — dla pełnego aneksu z pricing tile + reasonem to
 * okolice y=600. Konserwatywnie y=600 (lewa: pracownik, prawa: klient).
 */
export function getAnchorsForAnnex(): SignatureAnchor[] {
  const SIG_TOP_Y = 600;
  const SIG_HEIGHT = 32;
  return [
    {
      role: "employee",
      page: 0,
      x: M,
      y: SIG_TOP_Y,
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "employee",
      page: 0,
      x: M,
      y: SIG_TOP_Y + SIG_HEIGHT + 18,
      width: SIG_W * 0.5,
      height: 14,
      kind: "date",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24,
      y: SIG_TOP_Y,
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24,
      y: SIG_TOP_Y + SIG_HEIGHT + 18,
      width: SIG_W * 0.5,
      height: 14,
      kind: "date",
    },
  ];
}

/**
 * Anchors dla protokołu wydania urządzenia (handover).
 *
 * Wave 21 nie generuje jeszcze osobnego PDF wydania (kod wydania jest
 * krótkim potwierdzeniem). Zwracamy układ zbliżony do receipt-pdf.
 */
export function getAnchorsForHandover(): SignatureAnchor[] {
  const SIG_TOP_Y = 580;
  const SIG_HEIGHT = 34;
  return [
    {
      role: "employee",
      page: 0,
      x: M,
      y: SIG_TOP_Y,
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24,
      y: SIG_TOP_Y,
      width: SIG_W,
      height: SIG_HEIGHT,
      kind: "signature",
    },
    {
      role: "customer",
      page: 0,
      x: M + SIG_W + 24,
      y: SIG_TOP_Y + SIG_HEIGHT + 16,
      width: SIG_W * 0.5,
      height: 14,
      kind: "date",
    },
  ];
}

/** Skrócony lookup po `kind` z `mp_service_documents`. */
export function getAnchorsForKind(
  kind: "receipt" | "annex" | "handover" | "release_code" | "warranty" | "other",
): SignatureAnchor[] {
  switch (kind) {
    case "receipt":
      return getAnchorsForReceipt();
    case "annex":
      return getAnchorsForAnnex();
    case "handover":
    case "release_code":
      return getAnchorsForHandover();
    default:
      return [];
  }
}

/** Documenso v3 field type. */
export type DocumensoFieldType = "SIGNATURE" | "DATE" | "TEXT";

/** Pre-positioned field gotowy do `createDocumentForSigning({fields})`.
 *  `signerIndex` adresuje `signers[]` w opts (0-based) — Documenso integration
 *  rozwiąże go na recipientId po stronie create response. */
export interface DocumensoFieldPayload {
  signerIndex: number;
  type: DocumensoFieldType;
  pageNumber: number; // 1-based
  /** Procenty strony [0..100], origin top-left. */
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Mapuje listę anchorów + map roli na signerIndex (0-based) → płaską listę
 * pól akceptowanych przez Documenso v3 `POST /api/v1/documents/{id}/fields`.
 *
 * Documenso oczekuje:
 *   - pageNumber 1-based,
 *   - pageX/pageY/pageWidth/pageHeight w PROCENTACH strony [0..100],
 *     origin top-left (zgodnie z generowanym PDF).
 *
 * Zwracamy procenty (przeliczone z pkt PDF / wymiary A4). Anchors o
 * `kind="signature"` → SIGNATURE, "date" → DATE, "text" → TEXT.
 */
export function mapAnchorsToDocumensoFields(
  anchors: SignatureAnchor[],
  signerIndexByRole: Partial<Record<SignatureAnchorRole, number>>,
  pageWidth: number = PAGE_W,
  pageHeight: number = _PAGE_H,
): DocumensoFieldPayload[] {
  const out: DocumensoFieldPayload[] = [];
  for (const a of anchors) {
    const idx = signerIndexByRole[a.role];
    if (idx == null) continue;
    out.push({
      signerIndex: idx,
      type:
        a.kind === "date" ? "DATE" : a.kind === "text" ? "TEXT" : "SIGNATURE",
      pageNumber: a.page + 1,
      pageX: (a.x / pageWidth) * 100,
      pageY: (a.y / pageHeight) * 100,
      pageWidth: (a.width / pageWidth) * 100,
      pageHeight: (a.height / pageHeight) * 100,
    });
  }
  return out;
}

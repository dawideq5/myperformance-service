import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

/** Wejście do renderowania aneksu. Zachowuje kontrakt zgodny z istniejącym
 * wywołaniem z `app/api/panel/services/[id]/annex/route.ts` (pola `editor`,
 * `changes[]`, `summary`) i dodaje opcjonalne pola wykorzystywane przez
 * nowy branding Caseownia (delta/kwoty, dane kontaktowe klienta, adres
 * lokacji, sygnatariusz, znaczniki czasu). Brak nowych pól = render fallback
 * na bazie `changes` i `summary`. */
export interface AnnexInput {
  ticketNumber: string;
  serviceCreatedAt: string;
  customer: {
    firstName: string;
    lastName: string;
    /** Telefon — pokazywany w sekcji KLIENT, opcjonalny dla starych callerów. */
    phone?: string;
    /** Email — pokazywany w sekcji KLIENT, opcjonalny dla starych callerów. */
    email?: string;
  };
  device: {
    brand: string;
    model: string;
    imei: string;
    /** Krótki opis usterki (z `service.description`) — opcjonalny dla zwięzłości. */
    description?: string;
  };
  /** Lokacja przyjęcia — wyświetlana w stopce/sekcji ZLECENIE. */
  location?: {
    name?: string;
    address?: string;
  };
  /** Pracownik wystawiający aneks. */
  editor: { name: string; email: string };
  /** Lista zmian field-by-field — render zachowany dla compat z GET handler.
   * Używany gdy brak `pricing`. */
  changes?: { field: string; before: string; after: string }[];
  /** Konkretne dane wyceny — preferowane nad `changes`. Gdy podane, sekcja
   * "Zmiana wyceny" pokazuje 3 kafelki: Pierwotna / Delta / Nowa. */
  pricing?: {
    originalAmount: number;
    deltaAmount: number;
    newAmount: number;
  };
  /** Powód zmiany wyceny — krótki opis pracownika; wyświetlany jako blockquote. */
  summary: string;
  /** Sygnowane przez (ISO timestamp). Default: `issuedAt`. */
  signedAt?: string;
  /** Customer name override (np. potwierdzenie telefoniczne — kto). */
  customerSignerName?: string;
  issuedAt: string;
}

const TEXT = "#1a1a1a";
const MUTED = "#666666";
const LIGHT = "#aaaaaa";
const BG_LIGHT = "#f0f0f0";
const BG_ACCENT_RED = "#fde8e8";
const BG_ACCENT_GREEN = "#e6f6ec";

const FONT_REGULAR = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf");
const LOGO_SERWIS = path.join(process.cwd(), "public", "logos", "serwis-by-caseownia.png");
const LOGO_CASEOWNIA = path.join(process.cwd(), "public", "logos", "caseownia.jpeg");

/** Krótszy regulamin aneksu (4 punkty) — pełny regulamin jest w receipt-pdf.
 * Aneks tylko deklaruje zmiany do uprzednio podpisanego protokołu. */
const ANNEX_REGULATIONS =
  "1. Niniejszy aneks zmienia warunki finansowe pierwotnego zlecenia serwisowego, którego protokół przyjęcia został wcześniej podpisany przez Klienta. Pozostałe postanowienia regulaminu Serwis Telefonów Caseownia (UNIKOM S.C., Towarowa 2c, 43-100 Tychy) pozostają bez zmian. " +
  "2. Akceptacja aneksu skutkuje zmianą wyceny zlecenia o wartość delta wskazaną poniżej. Klient potwierdza, że został poinformowany o przyczynie zmiany i wyraża zgodę na nowy koszt naprawy. " +
  "3. Brak akceptacji aneksu w terminie 14 dni od jego wystawienia może skutkować zwrotem urządzenia bez wykonania spornych prac. Wykonane do tej pory diagnostyki oraz naprawy nieobjęte aneksem rozliczane są zgodnie z pierwotną wyceną. " +
  "4. Reklamacje dotyczące aneksu przyjmowane są pisemnie lub na adres biuro@caseownia.com w terminie 14 dni od daty akceptacji.";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatPLN(value: number): string {
  return `${value.toFixed(2)} PLN`;
}

/** Render aneksu do Buffer. PDFKit programmatic, JEDNA strona A4, branding
 * Caseownia (header + footer + Roboto fonts). */
export async function renderAnnexPdf(data: AnnexInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 0, // ręczne pozycjonowanie — spójne z receipt-pdf
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: `Aneks ${data.ticketNumber}`,
          Author: "Serwis Telefonów by Caseownia",
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("R", FONT_REGULAR);
      doc.registerFont("B", FONT_BOLD);

      doc.addPage({ size: "A4", margin: 0 });
      drawAnnexPage(doc, data);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawAnnexPage(doc: PDFKit.PDFDocument, data: AnnexInput): void {
  const PW = doc.page.width; // 595.28
  const PH = doc.page.height; // 841.89
  const M = 24;
  const W = PW - 2 * M;

  // ===== HEADER =====
  if (fs.existsSync(LOGO_SERWIS)) {
    doc.image(LOGO_SERWIS, M, M, { fit: [160, 42] });
  }
  doc
    .font("B")
    .fontSize(14)
    .fillColor(TEXT)
    .text("ANEKS", M, M + 4, { width: W, align: "right" });
  doc
    .font("B")
    .fontSize(11)
    .fillColor(TEXT)
    .text(`do zlecenia ${data.ticketNumber}`, M, M + 22, {
      width: W,
      align: "right",
    });
  doc
    .font("R")
    .fontSize(7)
    .fillColor(MUTED)
    .text(`Wystawiony ${formatDate(data.issuedAt)}`, M, M + 38, {
      width: W,
      align: "right",
    });
  doc
    .moveTo(M, M + 50)
    .lineTo(M + W, M + 50)
    .lineWidth(1.2)
    .strokeColor(TEXT)
    .stroke();

  let y = M + 60;

  // ===== KLIENT + ZLECENIE 2-col =====
  const colW = (W - 12) / 2;
  const customerRows: [string, string][] = [
    [
      "Imię i nazwisko",
      `${data.customer.firstName} ${data.customer.lastName}`.trim() || "—",
    ],
  ];
  if (data.customer.phone) customerRows.push(["Telefon", data.customer.phone]);
  if (data.customer.email) customerRows.push(["Email", data.customer.email]);

  drawColumn(doc, M, y, colW, "KLIENT", customerRows);

  const deviceRows: [string, string][] = [
    [
      "Marka i model",
      `${data.device.brand} ${data.device.model}`.trim() || "—",
    ],
    ["IMEI", data.device.imei || "—"],
    ["Pierwotne przyjęcie", formatDateOnly(data.serviceCreatedAt)],
  ];
  drawColumn(doc, M + colW + 12, y, colW, "ZLECENIE", deviceRows);
  y += 80;

  // ===== OPIS USTERKI (opcjonalny) =====
  if (data.device.description?.trim()) {
    y = drawSection(doc, M, y, W, "OPIS USTERKI");
    doc.font("R").fontSize(8.5).fillColor(TEXT);
    const txt = data.device.description.trim();
    const h = Math.min(doc.heightOfString(txt, { width: W - 12 }), 38);
    drawBlock(doc, M, y, W, h + 8, BG_LIGHT, TEXT);
    doc.text(txt, M + 8, y + 4, {
      width: W - 12,
      height: h,
      ellipsis: true,
    });
    y += h + 12;
  }

  // ===== POWÓD ANEKSU =====
  y = drawSection(doc, M, y, W, "POWÓD ZMIANY WYCENY");
  doc.font("R").fontSize(9).fillColor(TEXT);
  const reasonTxt = data.summary?.trim() || "(brak opisu)";
  const reasonH = Math.min(doc.heightOfString(reasonTxt, { width: W - 16 }), 60);
  drawBlock(doc, M, y, W, reasonH + 10, BG_LIGHT, TEXT);
  doc.text(reasonTxt, M + 10, y + 5, {
    width: W - 16,
    height: reasonH,
    ellipsis: true,
  });
  y += reasonH + 14;

  // ===== ZMIANA WYCENY (3 kafelki) lub fallback CHANGES TABLE =====
  if (data.pricing) {
    y = drawSection(doc, M, y, W, "ZMIANA WYCENY");
    const tileW = (W - 16) / 3;
    const tileH = 44;
    const { originalAmount, deltaAmount, newAmount } = data.pricing;

    drawAmountTile(doc, M, y, tileW, tileH, "PIERWOTNA KWOTA", formatPLN(originalAmount), BG_LIGHT, TEXT);

    const deltaPositive = deltaAmount >= 0;
    const deltaBg = deltaPositive ? BG_ACCENT_RED : BG_ACCENT_GREEN;
    const deltaFg = deltaPositive ? "#b91c1c" : "#15803d";
    const deltaSign = deltaPositive ? "+" : "";
    drawAmountTile(
      doc,
      M + tileW + 8,
      y,
      tileW,
      tileH,
      "DELTA",
      `${deltaSign}${formatPLN(deltaAmount)}`,
      deltaBg,
      deltaFg,
    );

    drawAmountTile(
      doc,
      M + 2 * (tileW + 8),
      y,
      tileW,
      tileH,
      "NOWA KWOTA",
      formatPLN(newAmount),
      "#fafafa",
      TEXT,
      1,
    );
    y += tileH + 14;
  } else if (data.changes && data.changes.length > 0) {
    y = drawSection(doc, M, y, W, "ZMIANY");
    doc
      .font("B")
      .fontSize(7)
      .fillColor(MUTED)
      .text("POLE", M, y, { width: W * 0.3 });
    doc.text("PRZED", M + W * 0.3, y, { width: W * 0.35 });
    doc.text("PO", M + W * 0.65, y, { width: W * 0.35 });
    y += 10;
    doc
      .moveTo(M, y)
      .lineTo(M + W, y)
      .lineWidth(0.5)
      .strokeColor(LIGHT)
      .stroke();
    y += 4;
    for (const ch of data.changes) {
      doc
        .font("B")
        .fontSize(8)
        .fillColor(TEXT)
        .text(ch.field, M, y, { width: W * 0.3 - 6 });
      doc
        .font("R")
        .fontSize(8)
        .fillColor(MUTED)
        .text(ch.before, M + W * 0.3, y, { width: W * 0.35 - 6 });
      doc
        .font("R")
        .fontSize(8)
        .fillColor(TEXT)
        .text(ch.after, M + W * 0.65, y, { width: W * 0.35 - 6 });
      y += 16;
      if (y > PH - 240) break; // hard stop — leave room for sigs+regulamin+footer
    }
    y += 4;
  }

  // ===== SYGNATARIUSZE =====
  y = drawSection(doc, M, y, W, "STRONY ANEKSU");
  const sgY = y;
  const sgColW = (W - 12) / 2;
  const signedAt = data.signedAt ?? data.issuedAt;
  drawColumn(doc, M, sgY, sgColW, "WYSTAWIA (PRACOWNIK)", [
    ["Imię i nazwisko", data.editor.name || "—"],
    ["Email", data.editor.email || "—"],
    ["Data wystawienia", formatDate(signedAt)],
  ]);
  drawColumn(doc, M + sgColW + 12, sgY, sgColW, "AKCEPTUJE (KLIENT)", [
    [
      "Imię i nazwisko",
      data.customerSignerName?.trim() ||
        `${data.customer.firstName} ${data.customer.lastName}`.trim() ||
        "—",
    ],
    ...(data.customer.email ? [["Email", data.customer.email]] as [string, string][] : []),
    ...(data.customer.phone ? [["Telefon", data.customer.phone]] as [string, string][] : []),
  ]);
  y += 80;

  // ===== SIGNATURES (linie do podpisu) =====
  const sigW = (W - 24) / 2;
  const SIG_HEIGHT = 32;
  doc
    .moveTo(M, y + SIG_HEIGHT)
    .lineTo(M + sigW, y + SIG_HEIGHT)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  doc
    .font("R")
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      data.editor.name
        ? `PODPIS PRACOWNIKA — ${data.editor.name.toUpperCase()}`
        : "PODPIS PRACOWNIKA",
      M,
      y + SIG_HEIGHT + 4,
      { width: sigW, align: "center", characterSpacing: 0.5 },
    );
  doc
    .moveTo(M + sigW + 24, y + SIG_HEIGHT)
    .lineTo(M + W, y + SIG_HEIGHT)
    .lineWidth(0.8)
    .stroke();
  doc.text("PODPIS KLIENTA", M + sigW + 24, y + SIG_HEIGHT + 4, {
    width: sigW,
    align: "center",
    characterSpacing: 0.5,
  });
  y += SIG_HEIGHT + 18;

  // ===== REGULAMIN ANEKSU (krótszy niż pełny) =====
  const FOOTER_H = 22;
  const regAvailH = PH - y - M - FOOTER_H - 4;
  if (regAvailH > 24) {
    doc
      .font("B")
      .fontSize(7)
      .fillColor(TEXT)
      .text("WARUNKI ANEKSU", M, y, { width: W, characterSpacing: 0.5 });
    doc
      .font("R")
      .fontSize(6.5)
      .fillColor("#333")
      .text(ANNEX_REGULATIONS, M, y + 11, {
        width: W,
        height: regAvailH - 11,
        lineGap: 1.2,
        align: "justify",
        ellipsis: true,
      });
  }

  // ===== FOOTER =====
  const fy = PH - M - FOOTER_H;
  doc
    .moveTo(M, fy)
    .lineTo(M + W, fy)
    .lineWidth(0.4)
    .strokeColor(LIGHT)
    .stroke();
  const footerLeft = data.location?.name
    ? `Serwis Telefonów by Caseownia · ${data.location.name}${
        data.location.address ? `, ${data.location.address}` : ""
      }`
    : "Serwis Telefonów by Caseownia · UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy";
  doc
    .font("R")
    .fontSize(6.5)
    .fillColor(MUTED)
    .text(footerLeft, M, fy + 6, { width: W - 80 });
  if (fs.existsSync(LOGO_CASEOWNIA)) {
    doc.image(LOGO_CASEOWNIA, M + W - 60, fy + 2, { fit: [60, 14] });
  }
}

function drawAmountTile(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  bg: string,
  fg: string,
  borderWidth = 0,
): void {
  doc.rect(x, y, w, h).fill(bg);
  if (borderWidth > 0) {
    doc.rect(x, y, w, h).lineWidth(borderWidth).strokeColor(fg).stroke();
  }
  doc
    .font("R")
    .fontSize(6.5)
    .fillColor(MUTED)
    .text(label, x, y + 8, {
      width: w,
      align: "center",
      characterSpacing: 0.5,
    });
  doc
    .font("B")
    .fontSize(13)
    .fillColor(fg)
    .text(value, x, y + 20, { width: w, align: "center" });
}

function drawColumn(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: [string, string][],
): void {
  doc.font("B").fontSize(8).fillColor(TEXT).text(title, x, y, {
    width: w,
    characterSpacing: 0.6,
  });
  doc
    .moveTo(x, y + 10)
    .lineTo(x + w, y + 10)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  let yy = y + 14;
  for (const [label, value] of rows) {
    doc
      .font("R")
      .fontSize(6.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, yy, {
        width: w,
        characterSpacing: 0.5,
        lineBreak: false,
      });
    doc
      .font("R")
      .fontSize(8.5)
      .fillColor(TEXT)
      .text(value, x, yy + 7, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
    yy += 19;
  }
}

function drawSection(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
): number {
  doc.font("B").fontSize(7.5).fillColor(TEXT).text(title, x, y, {
    width: w,
    characterSpacing: 0.6,
    lineBreak: false,
  });
  doc
    .moveTo(x, y + 9)
    .lineTo(x + w, y + 9)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  return y + 12;
}

function drawBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fillColor: string,
  borderColor: string,
  borderWidth = 0,
): void {
  doc.rect(x, y, w, h).fill(fillColor);
  doc.rect(x, y, 2.5, h).fill(borderColor);
  if (borderWidth > 0) {
    doc.rect(x, y, w, h).lineWidth(borderWidth).strokeColor(borderColor).stroke();
  }
}

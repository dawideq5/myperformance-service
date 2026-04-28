import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface ReceiptInput {
  ticketNumber: string;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  device: { brand: string; model: string; imei: string; color: string };
  lock: { type: string; code: string };
  description: string;
  visualCondition: {
    display_rating?: number;
    back_rating?: number;
    camera_rating?: number;
    frames_rating?: number;
    powers_on?: string;
    cracked_front?: boolean;
    cracked_back?: boolean;
    bent?: boolean;
    face_touch_id?: boolean;
    water_damage?: string;
    charging_current?: number;
    cleaning_accepted?: boolean;
    damage_markers?: {
      id: string;
      x: number;
      y: number;
      z: number;
      surface?: string;
      description?: string;
    }[];
  };
  estimate: number | null;
  cleaningPrice: number | null;
  cleaningAccepted: boolean;
  handover: { choice: "none" | "items"; items: string };
}

const DISPLAY_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny — bez śladów użytkowania.",
  9: "Lekkie ślady — ledwo widoczne pod kątem.",
  8: "Drobne rysy widoczne pod światłem.",
  7: "Widoczne rysy, ekran w pełni czytelny.",
  6: "Liczne rysy, drobne uszkodzenia powłoki.",
  5: "Wyraźne rysy, czasem widoczne.",
  4: "Pęknięty narożnik, ekran działa.",
  3: "Pęknięty ekran, dotyk reaguje.",
  2: "Mocno popękany, dotyk zaburzony.",
  1: "Zniszczony — uszkodzony dotyk.",
};
const BACK_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny.",
  9: "Lekkie ślady — ledwo widoczne.",
  8: "Drobne rysy lub mikropęknięcia.",
  7: "Widoczne rysy, brak pęknięć.",
  6: "Drobne pęknięcia, panel cały.",
  5: "Pęknięcia, panel solidny.",
  4: "Pęknięty, fragmenty na miejscu.",
  3: "Pęknięty z ubytkami.",
  2: "Mocno zniszczony, brakujące fragmenty.",
  1: "Brak panelu lub całkowicie rozbity.",
};
const CAMERA_DESCRIPTIONS: Record<number, string> = {
  10: "Idealne obiektywy i wyspa aparatów.",
  9: "Lekkie ślady na ramce wyspy.",
  8: "Drobne rysy na obudowie.",
  7: "Widoczne rysy ramki, szkła całe.",
  6: "Mikrorysy szkieł obiektywów.",
  5: "Rysy szkieł, fotografia OK.",
  4: "Pęknięte jedno z obiektywów.",
  3: "Pęknięte szkiełka, plamy na zdjęciach.",
  2: "Wiele pęknięć, artefakty.",
  1: "Zniszczone — fotografia niemożliwa.",
};
const FRAMES_DESCRIPTIONS: Record<number, string> = {
  10: "Ramki idealne.",
  9: "Mikrorysy widoczne pod kątem.",
  8: "Drobne otarcia na rogach.",
  7: "Widoczne otarcia, brak deformacji.",
  6: "Otarcia + drobne wgniecenia.",
  5: "Wgniecenia, ramki proste.",
  4: "Wyraźne wgniecenia, lekkie odkształcenie.",
  3: "Odkształcenia narożników.",
  2: "Mocno wygięte ramki.",
  1: "Zniszczone — wpływa na działanie.",
};
function ratingDesc(
  cat: "display" | "back" | "camera" | "frames",
  v: number | undefined,
): string {
  if (v == null) return "";
  const tables = {
    display: DISPLAY_DESCRIPTIONS,
    back: BACK_DESCRIPTIONS,
    camera: CAMERA_DESCRIPTIONS,
    frames: FRAMES_DESCRIPTIONS,
  };
  return tables[cat][v] ?? "";
}

const REGULATIONS_TEXT =
  "1.1. Właścicielem punktów Serwis Telefonów Caseownia oraz strony www.serwis.caseownia.com jest UNIKOM S.C. Krzysztof Rojek, ul. Towarowa 2c, 43-100 Tychy, NIP: 646-283-18-04, REGON: 240976330. " +
  "1.2. Regulamin określa zasady świadczenia usług serwisowych. " +
  "1.5. Klient, przekazując urządzenie do Serwisu, akceptuje warunki niniejszego regulaminu. " +
  "2.1. Przyjęcie potwierdzane jest protokołem zawierającym dane Klienta, opis usterki, stan wizualny oraz akcesoria. " +
  "3.3. Klient musi zaakceptować kosztorys przed naprawą. Brak akceptacji w ciągu 14 dni może skutkować zwrotem urządzenia bez naprawy. " +
  "3.5. Serwis nie ponosi odpowiedzialności za dane w urządzeniu. Klient jest zobowiązany wykonać kopię zapasową. " +
  "4.1. Na wykonane naprawy Serwis udziela gwarancji na okres 3 miesięcy, o ile nie uzgodniono inaczej. " +
  "4.2. Gwarancja obejmuje jedynie zakres naprawy i użyte części. Nie obejmuje uszkodzeń mechanicznych i zalania. " +
  "4.4. Serwis nie gwarantuje zachowania fabrycznej wodoszczelności urządzenia (IP67/IP68 i inne) po dokonanej naprawie. " +
  "4.5. Serwis nie bierze odpowiedzialności za uszkodzenie/odklejenie szkieł hartowanych oraz folii ochronnych. " +
  "5.1. Klient zobowiązany jest odebrać urządzenie w ciągu 21 dni od powiadomienia. " +
  "5.3. Jeśli urządzenie nie zostanie odebrane w ciągu 90 dni, Serwis może uznać je za porzucone (art. 180 KC). " +
  "6.1. Reklamacje należy zgłaszać pisemnie lub na adres biuro@caseownia.com. Serwis rozpatruje je w ciągu 14 dni. " +
  "7.1. Administratorem danych jest UNIKOM S.C. Dane przetwarzane są wyłącznie w celu realizacji zlecenia. Klient ma prawo do wglądu i poprawiania swoich danych.";

const LOCK_LABELS: Record<string, string> = {
  none: "Brak blokady",
  pin: "Hasło / PIN",
  pattern: "Wzór",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function projectMarker(m: {
  x: number;
  y: number;
  z: number;
  surface?: string;
}): { view: "front" | "back"; px: number; py: number } {
  const Z_RANGE = 0.85;
  const Y_RANGE = 1.7;
  const px = ((m.z + Z_RANGE) / (2 * Z_RANGE)) * 100;
  const py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
  const s = (m.surface ?? "").toLowerCase();
  const view: "front" | "back" =
    s.includes("tylny") || s.includes("aparat") || m.x < 0 ? "back" : "front";
  return {
    view,
    px: Math.max(8, Math.min(92, px)),
    py: Math.max(6, Math.min(94, py)),
  };
}

const FONT_REGULAR = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf");
const LOGO_SERWIS = path.join(process.cwd(), "public", "logos", "serwis-by-caseownia.png");
const LOGO_CASEOWNIA = path.join(process.cwd(), "public", "logos", "caseownia.jpeg");

const TEXT = "#1a1a1a";
const MUTED = "#666666";
const LIGHT = "#aaaaaa";
const BG_LIGHT = "#f0f0f0";

/** Render PDF do Buffer. PDFKit programmatic, JEDNA strona A4. */
export async function renderReceiptPdf(data: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 0, // ręczne pozycjonowanie
        autoFirstPage: false,
        bufferPages: true,
        info: {
          Title: `Potwierdzenie ${data.ticketNumber}`,
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
      drawSinglePage(doc, data);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function drawSinglePage(doc: PDFKit.PDFDocument, data: ReceiptInput): void {
  const PW = doc.page.width; // 595.28
  const PH = doc.page.height; // 841.89
  const M = 24; // margins
  const W = PW - 2 * M;

  // ===== HEADER =====
  if (fs.existsSync(LOGO_SERWIS)) {
    doc.image(LOGO_SERWIS, M, M, { fit: [160, 42] });
  }
  doc.font("B").fontSize(18).fillColor(TEXT);
  doc.text(data.ticketNumber, M, M + 8, { width: W, align: "right" });
  doc.font("R").fontSize(7).fillColor(MUTED);
  doc.text(formatDate(data.createdAt), M, M + 28, { width: W, align: "right" });
  doc
    .moveTo(M, M + 50)
    .lineTo(M + W, M + 50)
    .lineWidth(1.2)
    .strokeColor(TEXT)
    .stroke();

  let y = M + 56;

  // ===== KLIENT + URZĄDZENIE 2-col =====
  const colW = (W - 12) / 2;
  drawColumn(doc, M, y, colW, "KLIENT", [
    ["Imię i nazwisko", `${data.customer.firstName} ${data.customer.lastName}`],
    ["Telefon", data.customer.phone || "—"],
    ...(data.customer.email ? [["Email", data.customer.email]] as [string, string][] : []),
  ]);
  drawColumn(doc, M + colW + 12, y, colW, "URZĄDZENIE", [
    ["Marka i model", `${data.device.brand} ${data.device.model}`],
    ["Kolor", data.device.color || "—"],
    ["IMEI", data.device.imei || "—"],
  ]);
  y += 80;

  // ===== LOCK BLOCK =====
  if (data.lock.type !== "none") {
    drawBlock(doc, M, y, W, 22, BG_LIGHT, TEXT);
    doc
      .font("R")
      .fontSize(6.5)
      .fillColor(MUTED)
      .text((LOCK_LABELS[data.lock.type] ?? data.lock.type).toUpperCase(), M + 8, y + 4, {
        characterSpacing: 0.5,
      });
    doc.font("B").fontSize(10).fillColor(TEXT).text(data.lock.code || "—", M + 8, y + 12);
    y += 26;
  }

  // ===== OPIS USTERKI =====
  y = drawSection(doc, M, y, W, "OPIS USTERKI");
  doc.font("R").fontSize(8.5).fillColor(TEXT);
  const descTxt = data.description || "(brak opisu)";
  const descH = Math.min(doc.heightOfString(descTxt, { width: W - 12 }), 44);
  drawBlock(doc, M, y, W, descH + 8, BG_LIGHT, TEXT);
  doc.text(descTxt, M + 8, y + 4, {
    width: W - 12,
    height: descH,
    ellipsis: true,
  });
  y += descH + 12;

  // ===== TECHNICAL VIEW (if markers) =====
  const markers = data.visualCondition.damage_markers ?? [];
  if (markers.length > 0) {
    y = drawSection(doc, M, y, W, "LOKALIZACJA USZKODZEŃ");
    const phoneW = 50;
    const phoneH = 90;
    drawPhoneOutline(doc, M, y, phoneW, phoneH, "PRZÓD", "front", markers);
    drawPhoneOutline(
      doc,
      M + phoneW + 8,
      y,
      phoneW,
      phoneH,
      "TYŁ",
      "back",
      markers,
    );
    // Lista markerów obok
    const lx = M + phoneW * 2 + 24;
    const lw = W - (phoneW * 2 + 24);
    let ly = y;
    const maxMarkers = Math.min(markers.length, 6);
    markers.slice(0, maxMarkers).forEach((m, i) => {
      doc.circle(lx + 4, ly + 4, 4).fill(TEXT);
      doc
        .font("B")
        .fontSize(5.5)
        .fillColor("#fff")
        .text(String(i + 1), lx, ly + 1.5, { width: 8, align: "center" });
      doc
        .font("B")
        .fontSize(6.5)
        .fillColor(MUTED)
        .text((m.surface ?? "powierzchnia").toUpperCase(), lx + 12, ly, {
          width: lw - 12,
          characterSpacing: 0.4,
          height: 8,
          ellipsis: true,
        });
      doc
        .font("R")
        .fontSize(7.5)
        .fillColor(TEXT)
        .text(m.description?.trim() || "(brak opisu)", lx + 12, ly + 8, {
          width: lw - 12,
          height: 8,
          ellipsis: true,
        });
      ly += 18;
    });
    y += phoneH + 16;
  }

  // ===== STAN TECHNICZNY =====
  const ratings = (
    [
      { cat: "display", label: "Wyświetlacz", value: data.visualCondition.display_rating },
      { cat: "back", label: "Panel tylny", value: data.visualCondition.back_rating },
      { cat: "camera", label: "Wyspa aparatów", value: data.visualCondition.camera_rating },
      { cat: "frames", label: "Ramki boczne", value: data.visualCondition.frames_rating },
    ] as const
  ).filter((r) => r.value != null);

  const checklist: { label: string; value: string }[] = [];
  const v = data.visualCondition;
  if (v.powers_on) {
    const lab: Record<string, string> = {
      yes: "Włącza się",
      no: "NIE włącza się",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    checklist.push({ label: "Zasilanie", value: lab[v.powers_on] ?? v.powers_on });
  }
  if (v.cracked_front) checklist.push({ label: "Pęknięcia", value: "Pęknięty z przodu" });
  if (v.cracked_back) checklist.push({ label: "Pęknięcia", value: "Pęknięty z tyłu" });
  if (v.bent) checklist.push({ label: "Geometria", value: "Wygięty" });
  if (v.face_touch_id === false) checklist.push({ label: "Face/Touch ID", value: "Nie działa" });
  if (v.water_damage === "yes") checklist.push({ label: "Zalanie", value: "Tak" });
  if (v.water_damage === "unknown") checklist.push({ label: "Zalanie", value: "Nie ustalono" });
  if (v.charging_current != null) {
    checklist.push({
      label: "Prąd ładowania",
      value: `${v.charging_current.toFixed(2)} A`,
    });
  }

  if (ratings.length > 0 || checklist.length > 0) {
    y = drawSection(doc, M, y, W, "STAN TECHNICZNY");
    for (const r of ratings) {
      y = drawTwoColRow(doc, M, y, W, r.label, ratingDesc(r.cat, r.value));
    }
    for (const r of checklist) {
      y = drawTwoColRow(doc, M, y, W, r.label, r.value);
    }
    y += 4;
  }

  // ===== WYCENA =====
  y = drawSection(doc, M, y, W, "WYCENA ORIENTACYJNA");
  const repair = data.estimate ?? 0;
  const cleaning =
    data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repair + cleaning;
  const totH = cleaning > 0 ? 38 : 30;
  drawBlock(doc, M, y, W, totH, "#fafafa", TEXT, 1);
  doc.font("R").fontSize(8.5).fillColor(TEXT).text("Naprawa", M + 8, y + 5);
  doc
    .font("R")
    .fontSize(8.5)
    .text(`${repair.toFixed(2)} PLN`, M, y + 5, { width: W - 8, align: "right" });
  let cy = y + 16;
  if (cleaning > 0) {
    doc
      .font("R")
      .fontSize(8.5)
      .fillColor(TEXT)
      .text("Czyszczenie urządzenia", M + 8, cy);
    doc
      .font("R")
      .fontSize(8.5)
      .text(`${cleaning.toFixed(2)} PLN`, M, cy, { width: W - 8, align: "right" });
    cy += 11;
  }
  doc
    .moveTo(M + 8, cy)
    .lineTo(M + W - 8, cy)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  doc.font("B").fontSize(10).fillColor(TEXT).text("Razem", M + 8, cy + 3);
  doc
    .font("B")
    .fontSize(10)
    .text(`${total.toFixed(2)} PLN`, M, cy + 3, { width: W - 8, align: "right" });
  y += totH + 4;

  // ===== HANDOVER =====
  y = drawSection(doc, M, y, W, "POTWIERDZENIE ODBIORU");
  const handTxt =
    data.handover.choice === "none"
      ? "Potwierdzam, że przyjmowane urządzenie nie posiada karty SIM, karty pamięci SD ani nie posiadało etui przy przyjęciu."
      : `Pobrane od klienta dodatkowe przedmioty: ${data.handover.items}`;
  doc.font("R").fontSize(8.5).fillColor(TEXT);
  const handH = Math.min(doc.heightOfString(handTxt, { width: W - 12 }), 30);
  drawBlock(doc, M, y, W, handH + 8, BG_LIGHT, TEXT);
  doc.text(handTxt, M + 8, y + 4, { width: W - 12, height: handH, ellipsis: true });
  y += handH + 12;

  // ===== SIGNATURES =====
  const sigW = (W - 16) / 2;
  doc
    .moveTo(M, y + 24)
    .lineTo(M + sigW, y + 24)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  doc
    .font("R")
    .fontSize(7)
    .fillColor(MUTED)
    .text("PODPIS PRACOWNIKA", M, y + 28, {
      width: sigW,
      align: "center",
      characterSpacing: 0.5,
    });
  doc
    .moveTo(M + sigW + 16, y + 24)
    .lineTo(M + W, y + 24)
    .lineWidth(0.8)
    .stroke();
  doc.text("PODPIS KLIENTA", M + sigW + 16, y + 28, {
    width: sigW,
    align: "center",
    characterSpacing: 0.5,
  });
  y += 42;

  // ===== REGULAMIN (compact) =====
  // Reszta strony do końca minus footer.
  const FOOTER_H = 24;
  const regY = y;
  const regH = PH - regY - M - FOOTER_H - 4;
  doc
    .font("B")
    .fontSize(7)
    .fillColor(TEXT)
    .text("REGULAMIN ŚWIADCZENIA USŁUG SERWISOWYCH", M, regY, {
      width: W,
      characterSpacing: 0.5,
    });
  // 2-column small print
  const colGap = 8;
  const regColW = (W - colGap) / 2;
  doc.font("R").fontSize(5.7).fillColor("#333").text(REGULATIONS_TEXT, M, regY + 10, {
    width: regColW,
    height: regH - 10,
    columns: 2,
    columnGap: colGap,
    lineGap: 0.3,
    align: "justify",
    ellipsis: true,
  });

  // ===== FOOTER =====
  const fy = PH - M - FOOTER_H;
  doc
    .moveTo(M, fy)
    .lineTo(M + W, fy)
    .lineWidth(0.4)
    .strokeColor(LIGHT)
    .stroke();
  doc
    .font("R")
    .fontSize(6.5)
    .fillColor(MUTED)
    .text("Serwis Telefonów by Caseownia · UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy", M, fy + 6, {
      width: W - 80,
    });
  if (fs.existsSync(LOGO_CASEOWNIA)) {
    doc.image(LOGO_CASEOWNIA, M + W - 60, fy + 2, { fit: [60, 14] });
  }
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

function drawPhoneOutline(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  view: "front" | "back",
  markers: NonNullable<ReceiptInput["visualCondition"]["damage_markers"]>,
): void {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).fillAndStroke("#fafafa", TEXT);
  doc.roundedRect(x + 3, y + 8, w - 6, h - 16, 2).lineWidth(0.4).fillAndStroke("#ffffff", "#888");
  doc.circle(x + w / 2, y + 5, 1).fill("#444");
  markers.forEach((m, i) => {
    const p = projectMarker(m);
    if (p.view !== view) return;
    const cx = x + (p.px / 100) * w;
    const cy = y + (p.py / 100) * h;
    doc.circle(cx, cy, 2.8).fill(TEXT);
    doc
      .font("B")
      .fontSize(4.5)
      .fillColor("#fff")
      .text(String(i + 1), cx - 4, cy - 1.8, { width: 8, align: "center", lineBreak: false });
  });
  doc
    .font("B")
    .fontSize(5.5)
    .fillColor(TEXT)
    .text(label, x, y + h + 1, {
      width: w,
      align: "center",
      characterSpacing: 0.5,
      lineBreak: false,
    });
}

function drawTwoColRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): number {
  const labelW = 80;
  const valueW = w - labelW - 4;
  doc
    .font("B")
    .fontSize(7.5)
    .fillColor(TEXT)
    .text(label, x, y + 1, { width: labelW, lineBreak: false });
  doc
    .font("R")
    .fontSize(7.5)
    .fillColor("#333")
    .text(value, x + labelW, y + 1, {
      width: valueW,
      height: 12,
      ellipsis: true,
    });
  doc
    .moveTo(x, y + 11)
    .lineTo(x + w, y + 11)
    .lineWidth(0.3)
    .strokeColor("#cccccc")
    .stroke();
  return y + 12;
}

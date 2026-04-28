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
  10: "Stan idealny — bez śladów użytkowania, ekran nieuszkodzony.",
  9: "Bardzo lekkie ślady — ledwo widoczne pod kątem.",
  8: "Drobne rysy widoczne pod światłem.",
  7: "Widoczne rysy, ekran w pełni czytelny.",
  6: "Liczne rysy, drobne uszkodzenia powłoki.",
  5: "Wyraźne rysy, czasem widoczne podczas użytkowania.",
  4: "Pęknięty narożnik lub krawędź, ekran działa.",
  3: "Pęknięty ekran, ale działa i reaguje na dotyk.",
  2: "Mocno popękany ekran, dotyk częściowo zaburzony.",
  1: "Zniszczony ekran — ciężko czytelny lub uszkodzony dotyk.",
};
const BACK_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny — bez śladów użytkowania.",
  9: "Bardzo lekkie ślady — ledwo widoczne.",
  8: "Drobne rysy lub mikropęknięcia.",
  7: "Widoczne rysy, brak pęknięć.",
  6: "Drobne pęknięcia, panel cały.",
  5: "Pęknięcia, ale panel trzyma się solidnie.",
  4: "Pęknięty panel tylny, fragmenty na miejscu.",
  3: "Pęknięty z ubytkami szkła.",
  2: "Mocno zniszczony, brakujące fragmenty.",
  1: "Brak panelu lub całkowicie rozbity.",
};
const CAMERA_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny obiektywów i wyspy aparatów.",
  9: "Lekkie ślady na ramce wyspy.",
  8: "Drobne rysy na obudowie wyspy.",
  7: "Widoczne rysy ramki, szkła całe.",
  6: "Mikrorysy szkieł obiektywów.",
  5: "Wyraźne rysy szkieł, fotografia OK.",
  4: "Pęknięte jedno z obiektywów.",
  3: "Pęknięte szkiełka, plamy widoczne na zdjęciach.",
  2: "Wiele pęknięć, fotografia z artefaktami.",
  1: "Zniszczone aparaty — fotografia niemożliwa.",
};
const FRAMES_DESCRIPTIONS: Record<number, string> = {
  10: "Ramki idealne — bez śladów.",
  9: "Mikrorysy widoczne pod kątem.",
  8: "Drobne otarcia na rogach.",
  7: "Widoczne otarcia, brak deformacji.",
  6: "Otarcia + drobne wgniecenia.",
  5: "Wgniecenia, ramki proste.",
  4: "Wyraźne wgniecenia, lekkie odkształcenie.",
  3: "Odkształcenia narożników.",
  2: "Mocno wygięte ramki.",
  1: "Ramki zniszczone — wpływa na działanie.",
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

const REGULATIONS: { title: string; body: string }[] = [
  {
    title: "1. Postanowienia ogólne",
    body: '1.1. Właścicielem punktów "Serwis Telefonów Caseownia" oraz strony www.serwis.caseownia.com jest UNIKOM S.C. Krzysztof Rojek, ul. Towarowa 2c, 43-100 Tychy, NIP: 646-283-18-04, REGON: 240976330.\n1.2. Regulamin określa zasady świadczenia usług serwisowych oraz sprzedaży produktów w sklepach Caseownia i Smart Connect.\n1.5. Klient, przekazując urządzenie do Serwisu, akceptuje warunki niniejszego regulaminu.',
  },
  {
    title: "2. Przyjęcie urządzenia",
    body: "2.1. Przyjęcie potwierdzane jest protokołem zawierającym dane Klienta, opis usterki, stan wizualny oraz akcesoria.",
  },
  {
    title: "3. Wykonywanie usług",
    body: "3.3. Klient musi zaakceptować kosztorys przed naprawą. Brak akceptacji w ciągu 14 dni może skutkować zwrotem urządzenia bez naprawy.\n3.5. Serwis nie ponosi odpowiedzialności za dane w urządzeniu. Klient jest zobowiązany wykonać kopię zapasową.",
  },
  {
    title: "4. Gwarancja i odpowiedzialność",
    body: "4.1. Na wykonane naprawy Serwis udziela gwarancji na okres 3 miesięcy, o ile nie uzgodniono inaczej.\n4.2. Gwarancja obejmuje jedynie zakres naprawy i użyte części. Nie obejmuje uszkodzeń mechanicznych i zalania.\n4.4. Serwis nie gwarantuje zachowania fabrycznej wodoszczelności urządzenia (klasa IP67/IP68 i inne) po dokonanej naprawie.\n4.5. Serwis nie bierze odpowiedzialności za uszkodzenie lub konieczność odklejenia szkieł hartowanych oraz folii ochronnych podczas procesu serwisowego.",
  },
  {
    title: "5. Odbiór urządzenia",
    body: "5.1. Klient zobowiązany jest odebrać urządzenie w ciągu 21 dni od powiadomienia.\n5.3. Jeśli urządzenie nie zostanie odebrane w ciągu 90 dni, Serwis może uznać je za porzucone (art. 180 KC).",
  },
  {
    title: "6. Reklamacje",
    body: "6.1. Reklamacje należy zgłaszać pisemnie lub na adres biuro@caseownia.com. Serwis rozpatruje je w ciągu 14 dni.",
  },
  {
    title: "7. RODO — Ochrona danych osobowych",
    body: "7.1. Administratorem danych jest UNIKOM S.C. Dane przetwarzane są wyłącznie w celu realizacji zlecenia. Klient ma prawo do wglądu i poprawiania swoich danych.",
  },
];

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

const FONT_REGULAR = path.join(
  process.cwd(),
  "public",
  "fonts",
  "Roboto-Regular.ttf",
);
const FONT_BOLD = path.join(
  process.cwd(),
  "public",
  "fonts",
  "Roboto-Bold.ttf",
);
const LOGO_SERWIS = path.join(
  process.cwd(),
  "public",
  "logos",
  "serwis-by-caseownia.png",
);
const LOGO_CASEOWNIA = path.join(
  process.cwd(),
  "public",
  "logos",
  "caseownia.jpeg",
);

const COLOR = {
  text: "#1a1a1a",
  muted: "#666666",
  light: "#aaaaaa",
  bgLight: "#f5f5f5",
  border: "#888888",
};

/** Renderuje PDF do Buffer. Server-side use only. PDFKit programmatic
 * — nie używa React reconciler, kompatybilny z Node + React 19. */
export async function renderReceiptPdf(data: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 28,
        autoFirstPage: false,
        info: {
          Title: `Potwierdzenie ${data.ticketNumber}`,
          Author: "Serwis Telefonów by Caseownia",
        },
      });
      // Kolektowanie chunks → Buffer.
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Rejestracja czcionek z Polish glyphs.
      doc.registerFont("Regular", FONT_REGULAR);
      doc.registerFont("Bold", FONT_BOLD);

      // PAGE 1 — receipt
      doc.addPage({ size: "A4", margin: 28 });
      drawReceipt(doc, data);

      // PAGE 2 — regulamin
      doc.addPage({ size: "A4", margin: 28 });
      drawRegulations(doc);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function drawReceipt(doc: PDFKit.PDFDocument, data: ReceiptInput): void {
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const M = 28;
  const W = PAGE_W - 2 * M;

  // Header: logo + ticket number
  if (fs.existsSync(LOGO_SERWIS)) {
    doc.image(LOGO_SERWIS, M, M, { fit: [180, 50] });
  }
  doc
    .font("Bold")
    .fontSize(20)
    .fillColor(COLOR.text)
    .text(data.ticketNumber, M + 200, M + 6, { width: W - 200, align: "right" });
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor(COLOR.muted)
    .text(formatDate(data.createdAt), M + 200, M + 30, {
      width: W - 200,
      align: "right",
    });
  // separator line
  doc
    .moveTo(M, M + 60)
    .lineTo(M + W, M + 60)
    .lineWidth(1.5)
    .strokeColor(COLOR.text)
    .stroke();

  let y = M + 70;

  // Klient + Urządzenie 2-kolumny
  const colW = (W - 16) / 2;
  y = drawTwoColumnInfo(doc, M, y, colW, data);

  // Lock block
  if (data.lock.type !== "none") {
    y += 6;
    y = drawLockBlock(doc, M, y, W, data.lock);
  }

  // Opis usterki
  y += 6;
  drawSectionHeader(doc, M, y, W, "Opis usterki");
  y += 14;
  y = drawDescriptionBlock(doc, M, y, W, data.description || "(brak opisu)");

  // Lokalizacja uszkodzeń (jeśli markery)
  const markers = data.visualCondition.damage_markers ?? [];
  if (markers.length > 0) {
    y += 8;
    drawSectionHeader(doc, M, y, W, "Lokalizacja uszkodzeń");
    y += 14;
    y = drawTechnicalView(doc, M, y, W, markers);
  }

  // Stan techniczny
  const ratings = (
    [
      { cat: "display", label: "Wyświetlacz", value: data.visualCondition.display_rating },
      { cat: "back", label: "Panel tylny", value: data.visualCondition.back_rating },
      { cat: "camera", label: "Wyspa aparatów", value: data.visualCondition.camera_rating },
      { cat: "frames", label: "Ramki boczne", value: data.visualCondition.frames_rating },
    ] as const
  ).filter((r) => r.value != null);

  const checklistRows: { label: string; value: string }[] = [];
  const v = data.visualCondition;
  if (v.powers_on) {
    const lab: Record<string, string> = {
      yes: "Włącza się",
      no: "NIE włącza się",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    checklistRows.push({ label: "Zasilanie", value: lab[v.powers_on] ?? v.powers_on });
  }
  if (v.cracked_front) checklistRows.push({ label: "Pęknięcia", value: "Pęknięty z przodu" });
  if (v.cracked_back) checklistRows.push({ label: "Pęknięcia", value: "Pęknięty z tyłu" });
  if (v.bent) checklistRows.push({ label: "Geometria", value: "Wygięty" });
  if (v.face_touch_id === false) checklistRows.push({ label: "Face/Touch ID", value: "Nie działa" });
  if (v.water_damage === "yes") checklistRows.push({ label: "Zalanie", value: "Tak" });
  if (v.water_damage === "unknown") checklistRows.push({ label: "Zalanie", value: "Nie ustalono" });
  if (v.charging_current != null) {
    checklistRows.push({
      label: "Prąd ładowania",
      value: `${v.charging_current.toFixed(2)} A`,
    });
  }

  if (ratings.length > 0 || checklistRows.length > 0) {
    y += 8;
    drawSectionHeader(doc, M, y, W, "Stan techniczny");
    y += 14;
    for (const r of ratings) {
      y = drawTwoColRow(doc, M, y, W, r.label, ratingDesc(r.cat, r.value));
    }
    for (const r of checklistRows) {
      y = drawTwoColRow(doc, M, y, W, r.label, r.value);
    }
  }

  // Wycena
  y += 8;
  drawSectionHeader(doc, M, y, W, "Wycena orientacyjna");
  y += 14;
  y = drawTotalBlock(doc, M, y, W, data);

  // Potwierdzenie odbioru
  y += 8;
  drawSectionHeader(doc, M, y, W, "Potwierdzenie odbioru");
  y += 14;
  y = drawHandoverBlock(doc, M, y, W, data.handover);

  // Signatures (anchored near bottom)
  const sigY = Math.max(y + 16, PAGE_H - 80);
  drawSignatures(doc, M, sigY, W);

  // Footer
  drawFooter(doc, M, PAGE_H - 36, W);
}

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  title: string,
): void {
  doc
    .font("Bold")
    .fontSize(9)
    .fillColor(COLOR.text)
    .text(title.toUpperCase(), x, y, { characterSpacing: 0.6 });
  doc
    .moveTo(x, y + 11)
    .lineTo(x + w, y + 11)
    .lineWidth(1)
    .strokeColor(COLOR.text)
    .stroke();
}

function drawTwoColumnInfo(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colW: number,
  data: ReceiptInput,
): number {
  const yStart = y;
  // KLIENT
  doc.font("Bold").fontSize(9).fillColor(COLOR.text).text("KLIENT", x, y);
  doc
    .moveTo(x, y + 11)
    .lineTo(x + colW, y + 11)
    .lineWidth(1)
    .strokeColor(COLOR.text)
    .stroke();
  let yL = y + 14;
  yL = drawField(doc, x, yL, colW, "Imię i nazwisko", `${data.customer.firstName} ${data.customer.lastName}`);
  yL = drawField(doc, x, yL, colW, "Telefon", data.customer.phone || "—");
  if (data.customer.email) {
    yL = drawField(doc, x, yL, colW, "Email", data.customer.email);
  }

  // URZĄDZENIE
  const xR = x + colW + 16;
  doc.font("Bold").fontSize(9).fillColor(COLOR.text).text("URZĄDZENIE", xR, yStart);
  doc
    .moveTo(xR, yStart + 11)
    .lineTo(xR + colW, yStart + 11)
    .lineWidth(1)
    .strokeColor(COLOR.text)
    .stroke();
  let yR = yStart + 14;
  yR = drawField(doc, xR, yR, colW, "Marka i model", `${data.device.brand} ${data.device.model}`);
  yR = drawField(doc, xR, yR, colW, "Kolor", data.device.color || "—");
  yR = drawField(doc, xR, yR, colW, "IMEI", data.device.imei || "—");
  return Math.max(yL, yR);
}

function drawField(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): number {
  doc
    .font("Regular")
    .fontSize(7)
    .fillColor(COLOR.muted)
    .text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });
  doc
    .font("Regular")
    .fontSize(9.5)
    .fillColor(COLOR.text)
    .text(value, x, y + 8, { width: w });
  return y + 22;
}

function drawLockBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  lock: { type: string; code: string },
): number {
  const h = 28;
  doc.rect(x, y, w, h).fill(COLOR.bgLight);
  doc.rect(x, y, 3, h).fill(COLOR.text);
  doc
    .font("Regular")
    .fontSize(7)
    .fillColor(COLOR.muted)
    .text((LOCK_LABELS[lock.type] ?? lock.type).toUpperCase(), x + 8, y + 4, {
      characterSpacing: 0.5,
    });
  doc
    .font("Bold")
    .fontSize(11)
    .fillColor(COLOR.text)
    .text(lock.code || "—", x + 8, y + 13, { width: w - 16 });
  return y + h;
}

function drawDescriptionBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  text: string,
): number {
  // Padding 6, oblicz wysokość tekstu.
  doc.font("Regular").fontSize(9).fillColor(COLOR.text);
  const textH = doc.heightOfString(text, { width: w - 14 });
  const h = textH + 12;
  doc.rect(x, y, w, h).fill(COLOR.bgLight);
  doc.rect(x, y, 3, h).fill(COLOR.text);
  doc
    .font("Regular")
    .fontSize(9)
    .fillColor(COLOR.text)
    .text(text, x + 8, y + 6, { width: w - 14 });
  return y + h;
}

function drawTechnicalView(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  markers: NonNullable<ReceiptInput["visualCondition"]["damage_markers"]>,
): number {
  const phoneW = 60;
  const phoneH = 110;
  const phoneSpace = 8;
  const totalSvgW = phoneW * 2 + phoneSpace;
  const listX = x + totalSvgW + 16;
  const listW = w - (totalSvgW + 16);

  // Front + Back outline
  drawPhoneOutline(doc, x, y, phoneW, phoneH, "PRZÓD", "front", markers);
  drawPhoneOutline(
    doc,
    x + phoneW + phoneSpace,
    y,
    phoneW,
    phoneH,
    "TYŁ",
    "back",
    markers,
  );

  // Lista markerów
  let lyy = y;
  markers.forEach((m, i) => {
    const num = String(i + 1);
    // numbered circle
    doc.circle(listX + 5, lyy + 5, 5).fill(COLOR.text);
    doc
      .font("Bold")
      .fontSize(6)
      .fillColor("#fff")
      .text(num, listX, lyy + 2.5, { width: 10, align: "center" });
    // surface + description
    doc
      .font("Regular")
      .fontSize(7)
      .fillColor(COLOR.muted)
      .text((m.surface ?? "powierzchnia").toUpperCase(), listX + 14, lyy, {
        width: listW - 14,
        characterSpacing: 0.4,
      });
    doc
      .font("Regular")
      .fontSize(8.5)
      .fillColor(COLOR.text)
      .text(m.description?.trim() || "(brak opisu)", listX + 14, lyy + 8, {
        width: listW - 14,
      });
    lyy += 22;
  });

  return Math.max(y + phoneH + 14, lyy);
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
  // Phone body outline
  doc
    .roundedRect(x, y, w, h, 8)
    .lineWidth(1)
    .fillAndStroke("#fafafa", COLOR.text);
  // Inner screen area
  doc
    .roundedRect(x + 4, y + 10, w - 8, h - 20, 3)
    .lineWidth(0.5)
    .fillAndStroke("#ffffff", COLOR.border);
  // Top dot
  doc.circle(x + w / 2, y + 6, 1.2).fill("#444");

  // Markers
  markers.forEach((m, i) => {
    const p = projectMarker(m);
    if (p.view !== view) return;
    const cx = x + (p.px / 100) * w;
    const cy = y + (p.py / 100) * h;
    doc.circle(cx, cy, 3.5).fill(COLOR.text);
    doc
      .font("Bold")
      .fontSize(5)
      .fillColor("#fff")
      .text(String(i + 1), cx - 5, cy - 2.2, { width: 10, align: "center" });
  });

  // Label
  doc
    .font("Bold")
    .fontSize(6)
    .fillColor(COLOR.text)
    .text(label, x, y + h + 2, { width: w, align: "center", characterSpacing: 0.5 });
}

function drawTwoColRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
): number {
  const labelW = 90;
  const valueW = w - labelW - 4;
  doc.font("Bold").fontSize(8).fillColor(COLOR.text).text(label, x + 4, y + 2, {
    width: labelW,
  });
  doc
    .font("Regular")
    .fontSize(8)
    .fillColor("#333")
    .text(value, x + labelW, y + 2, { width: valueW });
  const rowH = Math.max(
    14,
    doc.heightOfString(value, { width: valueW }) + 4,
  );
  doc
    .moveTo(x, y + rowH)
    .lineTo(x + w, y + rowH)
    .lineWidth(0.4)
    .strokeColor("#cccccc")
    .stroke();
  return y + rowH;
}

function drawTotalBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  data: ReceiptInput,
): number {
  const repair = data.estimate ?? 0;
  const cleaning =
    data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repair + cleaning;
  const hasCleaning = cleaning > 0;
  const h = hasCleaning ? 50 : 38;

  doc.rect(x, y, w, h).lineWidth(1.2).strokeColor(COLOR.text).fillAndStroke("#fafafa", COLOR.text);

  // Naprawa
  doc.font("Regular").fontSize(9).fillColor(COLOR.text).text("Naprawa", x + 8, y + 6);
  doc
    .font("Regular")
    .fontSize(9)
    .text(`${repair.toFixed(2)} PLN`, x + 8, y + 6, {
      width: w - 16,
      align: "right",
    });

  let cy = y + 18;
  if (hasCleaning) {
    doc
      .font("Regular")
      .fontSize(9)
      .text("Czyszczenie urządzenia", x + 8, cy);
    doc
      .font("Regular")
      .fontSize(9)
      .text(`${cleaning.toFixed(2)} PLN`, x + 8, cy, {
        width: w - 16,
        align: "right",
      });
    cy += 12;
  }

  // separator
  doc
    .moveTo(x + 8, cy + 1)
    .lineTo(x + w - 8, cy + 1)
    .lineWidth(1.2)
    .strokeColor(COLOR.text)
    .stroke();

  // Total
  doc
    .font("Bold")
    .fontSize(11)
    .fillColor(COLOR.text)
    .text("Razem orientacyjnie", x + 8, cy + 5);
  doc
    .font("Bold")
    .fontSize(11)
    .text(`${total.toFixed(2)} PLN`, x + 8, cy + 5, {
      width: w - 16,
      align: "right",
    });

  return y + h;
}

function drawHandoverBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  handover: ReceiptInput["handover"],
): number {
  const text =
    handover.choice === "none"
      ? "Potwierdzam, że przyjmowane urządzenie nie posiada karty SIM, karty pamięci SD ani nie posiadało etui przy przyjęciu."
      : `Pobrane od klienta dodatkowe przedmioty:\n${handover.items}`;
  doc.font("Regular").fontSize(9).fillColor(COLOR.text);
  const textH = doc.heightOfString(text, { width: w - 14 });
  const h = textH + 12;
  doc.rect(x, y, w, h).fill(COLOR.bgLight);
  doc.rect(x, y, 3, h).fill(COLOR.text);
  doc
    .font("Regular")
    .fontSize(9)
    .fillColor(COLOR.text)
    .text(text, x + 8, y + 6, { width: w - 14 });
  return y + h;
}

function drawSignatures(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
): void {
  const colW = (w - 16) / 2;
  // Lewa
  doc
    .moveTo(x, y)
    .lineTo(x + colW, y)
    .lineWidth(0.8)
    .strokeColor(COLOR.text)
    .stroke();
  doc
    .font("Regular")
    .fontSize(7.5)
    .fillColor(COLOR.muted)
    .text("PODPIS PRACOWNIKA", x, y + 4, {
      width: colW,
      align: "center",
      characterSpacing: 0.5,
    });
  // Prawa
  const xR = x + colW + 16;
  doc
    .moveTo(xR, y)
    .lineTo(xR + colW, y)
    .lineWidth(0.8)
    .strokeColor(COLOR.text)
    .stroke();
  doc
    .font("Regular")
    .fontSize(7.5)
    .fillColor(COLOR.muted)
    .text("PODPIS KLIENTA", xR, y + 4, {
      width: colW,
      align: "center",
      characterSpacing: 0.5,
    });
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
): void {
  doc
    .moveTo(x, y - 6)
    .lineTo(x + w, y - 6)
    .lineWidth(0.5)
    .strokeColor(COLOR.light)
    .stroke();
  doc
    .font("Regular")
    .fontSize(7)
    .fillColor(COLOR.muted)
    .text("Serwis Telefonów by Caseownia · UNIKOM S.C.", x, y, { width: w - 100 });
  if (fs.existsSync(LOGO_CASEOWNIA)) {
    doc.image(LOGO_CASEOWNIA, x + w - 70, y - 4, { fit: [70, 18] });
  }
}

function drawRegulations(doc: PDFKit.PDFDocument): void {
  const M = 28;
  const W = doc.page.width - 2 * M;
  doc
    .font("Bold")
    .fontSize(13)
    .fillColor(COLOR.text)
    .text("Regulamin świadczenia usług serwisowych", M, M, {
      width: W,
      align: "center",
    });
  let y = M + 24;
  for (const sec of REGULATIONS) {
    doc.font("Bold").fontSize(9).fillColor(COLOR.text).text(sec.title, M, y);
    y += 12;
    doc.font("Regular").fontSize(8).fillColor("#333").text(sec.body, M, y, {
      width: W,
    });
    y += doc.heightOfString(sec.body, { width: W }) + 8;
  }
  drawFooter(doc, M, doc.page.height - 36, W);
}

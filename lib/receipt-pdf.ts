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
  /** Imię i nazwisko pracownika przyjmującego — wyświetlane pod linią
   * podpisu pracownika. */
  employeeName?: string;
  /** Data URL PNG podpisu pracownika — embedowany w PDF nad linią. Gdy
   * brak, zostaje samo pole do podpisu ręcznego. */
  employeeSignaturePng?: string | null;
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

// 1:1 z panel-sprzedawca/components/intake/RatingScale.tsx — pracownik
// widzi te same opisy w konfiguratorze co klient na PDF.
const DISPLAY_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskany ekran, brak reakcji na dotyk lub obraz fragmentaryczny.",
  2: "Liczne pęknięcia, dotyk reaguje częściowo.",
  3: "Wiele pęknięć i głębokich rys, dotyk z perturbacjami.",
  4: "Pojedyncze pęknięcie, dotyk i obraz w pełni sprawne.",
  5: "Wyraźne rysy na całej powierzchni, ekran sprawny.",
  6: "Drobne rysy widoczne pod kątem, ekran w pełni sprawny.",
  7: "Lekkie ślady użytkowania, mikro-rysy w rogach.",
  8: "Bardzo dobry stan, kilka mikro-rys widocznych pod lupą.",
  9: "Praktycznie bez śladów użytkowania.",
  10: "Stan jak nowy.",
};
const BACK_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskany panel tylny.",
  2: "Liczne pęknięcia, panel wymaga wymiany.",
  3: "Pęknięcia oraz głębokie rysy.",
  4: "Pojedyncze pęknięcie.",
  5: "Wyraźne rysy widoczne pod każdym kątem.",
  6: "Drobne rysy w odbiciu światła.",
  7: "Lekkie ślady użytkowania.",
  8: "Bardzo dobry stan, mikro-rysy.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
};
const CAMERA_DESCRIPTIONS: Record<number, string> = {
  1: "Roztrzaskane szkiełka obiektywów, aparat nie ostrzy.",
  2: "Pęknięte szkiełka, plamy widoczne na zdjęciach.",
  3: "Pęknięte szkiełko jednego z obiektywów.",
  4: "Głębokie rysy na szkiełkach.",
  5: "Wyraźne rysy widoczne na zdjęciach pod światło.",
  6: "Drobne rysy, jakość zdjęć bez zauważalnych problemów.",
  7: "Lekkie ślady użytkowania, obiektywy sprawne.",
  8: "Bardzo dobry stan szkiełek.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
};
const FRAMES_DESCRIPTIONS: Record<number, string> = {
  1: "Ramka pęknięta lub silnie zdeformowana.",
  2: "Liczne wgniecenia, deformacja krawędzi.",
  3: "Głębokie wgniecenia, otarcia powłoki.",
  4: "Wgniecenia oraz otarcia ramki.",
  5: "Liczne otarcia w narożach.",
  6: "Drobne otarcia widoczne pod światło.",
  7: "Lekkie ślady użytkowania.",
  8: "Bardzo dobry stan, mikro-otarcia.",
  9: "Praktycznie idealny.",
  10: "Stan jak nowy.",
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

/** Projektuje marker 3D → 2D na phone outline. surface ma priorytet nad
 * geometrią: pewnie wskazuje przód/tył nawet gdy local x nie jest
 * jednoznaczny (np. ramki przebiegają wzdłuż obu stron). */
type DamageView = "front" | "back" | "top" | "bottom" | "left" | "right";

const VIEW_LABELS: Record<DamageView, string> = {
  front: "PRZÓD",
  back: "TYŁ",
  top: "GÓRNA RAMKA",
  bottom: "DOLNA RAMKA",
  left: "LEWA RAMKA",
  right: "PRAWA RAMKA",
};

const VIEW_DIMS: Record<DamageView, { w: number; h: number }> = {
  front: { w: 48, h: 86 },
  back: { w: 48, h: 86 },
  top: { w: 86, h: 18 },
  bottom: { w: 86, h: 18 },
  left: { w: 18, h: 86 },
  right: { w: 18, h: 86 },
};

/** Klasyfikuje marker do widoku po surface label + fallback na coords. */
function classifyView(m: {
  x: number;
  y: number;
  z: number;
  surface?: string;
}): DamageView {
  const s = (m.surface ?? "").toLowerCase();
  if (s.includes("górna") || s.includes("góra") || s.includes("głośnik rozmów"))
    return "top";
  if (
    s.includes("dolna") ||
    s.includes("dół") ||
    s.includes("port") ||
    s.includes("głośnik") // głośniczki dolne
  )
    return "bottom";
  if (s.includes("ramka prawa") || s.includes("prawa")) return "right";
  if (s.includes("ramka lewa") || s.includes("lewa")) return "left";
  if (
    s.includes("panel ty") ||
    s.includes("tylny") ||
    s.includes("aparat") ||
    s.includes("wyspa") ||
    s.includes("back")
  )
    return "back";
  if (
    s.includes("wyświetla") ||
    s.includes("ekran") ||
    s.includes("przód") ||
    s.includes("display")
  )
    return "front";
  // Fallback geometric.
  const Y_RANGE = 1.7;
  const Z_RANGE = 0.85;
  if (m.y > Y_RANGE * 0.7) return "top";
  if (m.y < -Y_RANGE * 0.7) return "bottom";
  if (m.z > Z_RANGE * 0.6) return "right";
  if (m.z < -Z_RANGE * 0.6) return "left";
  return m.x < 0 ? "back" : "front";
}

/** Pozycja markera w obrębie outline (px,py 0..100). Zakresy dopasowane
 * do faktycznego extent phone w outer-group frame (worldToLocal):
 *   Y±1.4 (visible long axis, classifyDamageZones używa 1.25 boundary)
 *   Z±0.55 (faktyczne ramki boczne, classifyDamageZones używa 0.55)
 *   X±0.09 (cienka głębokość) */
function projectInView(
  view: DamageView,
  m: { x: number; y: number; z: number },
): { px: number; py: number } {
  const Y_RANGE = 1.4;
  const Z_RANGE = 0.55;
  const X_RANGE = 0.09;
  let px = 50;
  let py = 50;
  switch (view) {
    case "front":
      px = ((m.z + Z_RANGE) / (2 * Z_RANGE)) * 100;
      py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
      break;
    case "back":
      px = ((Z_RANGE - m.z) / (2 * Z_RANGE)) * 100; // mirror X
      py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
      break;
    case "top":
    case "bottom":
      px = ((m.z + Z_RANGE) / (2 * Z_RANGE)) * 100;
      py = ((m.x + X_RANGE) / (2 * X_RANGE)) * 100;
      break;
    case "left":
      px = ((X_RANGE - m.x) / (2 * X_RANGE)) * 100;
      py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
      break;
    case "right":
      px = ((m.x + X_RANGE) / (2 * X_RANGE)) * 100;
      py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
      break;
  }
  return {
    px: Math.max(15, Math.min(85, px)),
    py: Math.max(15, Math.min(85, py)),
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
export interface SignatureBox {
  /** Procent strony [0-100], origin top-left. */
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
}

export interface ReceiptRenderResult {
  buffer: Buffer;
  pageWidth: number; // pt
  pageHeight: number; // pt
  /** Pozycje pól podpisu w procentach strony (Documenso convention). */
  signatures: { employee: SignatureBox; customer: SignatureBox };
}

export async function renderReceiptPdf(data: ReceiptInput): Promise<Buffer> {
  const r = await renderReceiptPdfWithLayout(data);
  return r.buffer;
}

export async function renderReceiptPdfWithLayout(
  data: ReceiptInput,
): Promise<ReceiptRenderResult> {
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
      const layout: { signatures?: ReceiptRenderResult["signatures"] } = {};
      doc.on("end", () => {
        const pageW = 595.28;
        const pageH = 841.89;
        resolve({
          buffer: Buffer.concat(chunks),
          pageWidth: pageW,
          pageHeight: pageH,
          signatures: layout.signatures ?? {
            employee: { pageX: 6, pageY: 56, pageWidth: 38, pageHeight: 5 },
            customer: { pageX: 56, pageY: 56, pageWidth: 38, pageHeight: 5 },
          },
        });
      });
      doc.on("error", reject);

      doc.registerFont("R", FONT_REGULAR);
      doc.registerFont("B", FONT_BOLD);

      doc.addPage({ size: "A4", margin: 0 });
      const sig = drawSinglePage(doc, data);
      layout.signatures = sig;
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function drawSinglePage(
  doc: PDFKit.PDFDocument,
  data: ReceiptInput,
): { employee: SignatureBox; customer: SignatureBox } {
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

  // Lock block usunięty z potwierdzenia — pracownik wie z systemu, klient
  // nie powinien widzieć kodu na papierze (security).

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

  // ===== TECHNICAL VIEW: 6 widoków, tylko gdy markery dla danego widoku =====
  const allMarkers = data.visualCondition.damage_markers ?? [];
  if (allMarkers.length > 0) {
    y = drawSection(doc, M, y, W, "LOKALIZACJA USZKODZEŃ");
    // Klasyfikuj markery + przypisz globalny numer (1..N w kolejności).
    const markersWithNum = allMarkers.map((m, i) => ({
      m,
      num: i + 1,
      view: classifyView(m),
    }));
    const VIEWS_ORDER: DamageView[] = [
      "front",
      "back",
      "top",
      "bottom",
      "left",
      "right",
    ];
    const viewsWithMarkers = VIEWS_ORDER.filter((v) =>
      markersWithNum.some((mn) => mn.view === v),
    );

    // Layout: do 3 widoków per row, kolejne wiersze poniżej.
    let rowX = M;
    let rowMaxH = 0;
    let curY = y;
    const GAP = 8;
    for (const view of viewsWithMarkers) {
      const dims = VIEW_DIMS[view];
      const labelH = 8;
      const totalH = dims.h + labelH + 4;
      // Wrap to new row if doesn't fit.
      if (rowX + dims.w > M + W) {
        rowX = M;
        curY += rowMaxH + GAP;
        rowMaxH = 0;
      }
      drawDamageViewBox(
        doc,
        rowX,
        curY,
        view,
        markersWithNum.filter((mn) => mn.view === view),
      );
      rowX += dims.w + GAP;
      if (totalH > rowMaxH) rowMaxH = totalH;
    }
    y = curY + rowMaxH + 6;

    // Lista markerów (numer + powierzchnia + opis) — pełna lista.
    for (const mn of markersWithNum) {
      doc.circle(M + 4, y + 4, 4).fill(TEXT);
      doc
        .font("B")
        .fontSize(5.5)
        .fillColor("#fff")
        .text(String(mn.num), M, y + 1.5, {
          width: 8,
          align: "center",
          lineBreak: false,
        });
      doc
        .font("B")
        .fontSize(7)
        .fillColor(MUTED)
        .text((mn.m.surface ?? "powierzchnia").toUpperCase(), M + 12, y, {
          width: W - 12,
          characterSpacing: 0.4,
          lineBreak: false,
          height: 9,
          ellipsis: true,
        });
      doc
        .font("R")
        .fontSize(8)
        .fillColor(TEXT)
        .text(mn.m.description?.trim() || "(brak opisu)", M + 12, y + 8, {
          width: W - 12,
          lineBreak: false,
          height: 10,
          ellipsis: true,
        });
      y += 20;
    }
    y += 2;
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
  y = drawSection(doc, M, y, W, "WYCENA");
  const repair = data.estimate ?? 0;
  const cleaning =
    data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repair + cleaning;
  // Wysokość bloku liczona dynamicznie z liczby pozycji + zawsze separator
  // + Razem. 16pt na pozycję + 4pt padding nad separatorem + 16pt Razem
  // + 6pt dolnego paddingu. Bez cleaning: 1 pozycja → 16+4+16+6 = 42.
  // Z cleaning: 2 pozycje → 32+4+16+6 = 58.
  const itemRows = cleaning > 0 ? 2 : 1;
  const totH = itemRows * 16 + 4 + 18 + 6;
  drawBlock(doc, M, y, W, totH, "#fafafa", TEXT, 1);
  doc.font("R").fontSize(8.5).fillColor(TEXT).text("Naprawa", M + 8, y + 6);
  doc
    .font("R")
    .fontSize(8.5)
    .text(`${repair.toFixed(2)} PLN`, M, y + 6, {
      width: W - 16,
      align: "right",
    });
  let cy = y + 22;
  if (cleaning > 0) {
    doc
      .font("R")
      .fontSize(8.5)
      .fillColor(TEXT)
      .text("Czyszczenie urządzenia", M + 8, cy - 6);
    doc
      .font("R")
      .fontSize(8.5)
      .text(`${cleaning.toFixed(2)} PLN`, M, cy - 6, {
        width: W - 16,
        align: "right",
      });
    cy += 10;
  }
  doc
    .moveTo(M + 8, cy)
    .lineTo(M + W - 8, cy)
    .lineWidth(0.8)
    .strokeColor(TEXT)
    .stroke();
  doc.font("B").fontSize(10).fillColor(TEXT).text("Razem", M + 8, cy + 5);
  doc
    .font("B")
    .fontSize(10)
    .text(`${total.toFixed(2)} PLN`, M, cy + 5, {
      width: W - 16,
      align: "right",
    });
  y += totH + 8;

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

  // ===== SIGNATURES — wyższe pola, więcej miejsca na podpisy ręczne =====
  const sigW = (W - 24) / 2;
  const SIG_HEIGHT = 34; // miejsce na rzeczywisty podpis
  const sigTopY = y; // top sygnatur (pole Documenso od top do linii)
  // Lewa: pracownik. Embed podpisu PNG gdy podany (z signature pad in-app).
  if (data.employeeSignaturePng) {
    try {
      const base64 = data.employeeSignaturePng.replace(
        /^data:image\/[a-z]+;base64,/,
        "",
      );
      const buf = Buffer.from(base64, "base64");
      doc.image(buf, M + 4, y + 2, {
        fit: [sigW - 8, SIG_HEIGHT - 4],
        align: "center",
        valign: "center",
      });
    } catch {
      // bad base64 — pomijamy embed, zostaje samo pole do podpisu ręcznego.
    }
  }
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
      data.employeeName
        ? `PODPIS PRACOWNIKA — ${data.employeeName.toUpperCase()}`
        : "PODPIS PRACOWNIKA",
      M,
      y + SIG_HEIGHT + 4,
      {
        width: sigW,
        align: "center",
        characterSpacing: 0.5,
      },
    );
  // Prawa: klient
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

  // === SIGNATURE BOX coords w procentach strony (Documenso convention).
  // Origin top-left, jednostki: % strony (0-100). Pole pokrywa obszar nad
  // linią "PODPIS …" — od top sigTopY do linii (sigTopY + SIG_HEIGHT).
  const employeeBox: SignatureBox = {
    pageX: (M / PW) * 100,
    pageY: (sigTopY / PH) * 100,
    pageWidth: (sigW / PW) * 100,
    pageHeight: (SIG_HEIGHT / PH) * 100,
  };
  const customerBox: SignatureBox = {
    pageX: ((M + sigW + 24) / PW) * 100,
    pageY: (sigTopY / PH) * 100,
    pageWidth: (sigW / PW) * 100,
    pageHeight: (SIG_HEIGHT / PH) * 100,
  };

  // ===== REGULAMIN — rozłożony, 2 kolumny, większy font =====
  const FOOTER_H = 22;
  const regY = y;
  const regAvailH = PH - regY - M - FOOTER_H - 4;
  doc
    .font("B")
    .fontSize(7.5)
    .fillColor(TEXT)
    .text("REGULAMIN ŚWIADCZENIA USŁUG SERWISOWYCH", M, regY, {
      width: W,
      characterSpacing: 0.6,
    });
  // 2-col, bigger font (6.5pt), więcej line-gap żeby tekst oddychał.
  const colGap = 14;
  const regColW = (W - colGap) / 2;
  doc
    .font("R")
    .fontSize(6.5)
    .fillColor("#333")
    .text(REGULATIONS_TEXT, M, regY + 12, {
      width: regColW,
      height: regAvailH - 12,
      columns: 2,
      columnGap: colGap,
      lineGap: 1.2,
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

  return { employee: employeeBox, customer: customerBox };
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

function drawDamageViewBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  view: DamageView,
  markersForView: { m: { x: number; y: number; z: number }; num: number }[],
): void {
  const { w, h } = VIEW_DIMS[view];
  // Tło + outline. Zaokrąglone narożniki dla front/back, square dla ramek.
  const r = view === "front" || view === "back" ? 5 : 2;
  doc.roundedRect(x, y, w, h, r).lineWidth(0.8).fillAndStroke("#fafafa", TEXT);

  // Maksymalnie proste szkice — tylko outline, bez wypełnień, bez detali.
  if (view === "front") {
    // Wycięcie na kamerę (notch) — pusta linia, bez fill.
    doc
      .roundedRect(x + w / 2 - 5, y + 4, 10, 2.5, 1)
      .lineWidth(0.5)
      .stroke("#888");
  } else if (view === "back") {
    // Wyspa aparatów — tylko outline, bez czarnych obiektywów, bez fill.
    doc
      .roundedRect(x + 5, y + 5, 14, 14, 2.5)
      .lineWidth(0.5)
      .stroke("#888");
  }
  // top/bottom/left/right: tylko outline ramki, bez markerów elementów.

  // Markery w widoku.
  for (const { m, num } of markersForView) {
    const p = projectInView(view, m);
    const cx = x + (p.px / 100) * w;
    const cy = y + (p.py / 100) * h;
    doc.circle(cx, cy, 2.8).fill(TEXT);
    doc
      .font("B")
      .fontSize(4.5)
      .fillColor("#fff")
      .text(String(num), cx - 4, cy - 1.8, {
        width: 8,
        align: "center",
        lineBreak: false,
      });
  }

  // Label — rozdzielamy ręcznie (PRZÓD / TYŁ jednowyrazowe; ramki:
  // "GÓRNA RAMKA" → 2 wiersze "GÓRNA\nRAMKA"). Width szeroki na cały
  // wiersz nawet dla wąskich widoków (left/right ramka), żeby nie łamać
  // wewnątrz wyrazu.
  const label = VIEW_LABELS[view];
  const labelLines = label.includes(" ") ? label.split(" ") : [label];
  const labelText = labelLines.join("\n");
  doc
    .font("B")
    .fontSize(5.5)
    .fillColor(TEXT)
    .text(labelText, x - 10, y + h + 1, {
      width: w + 20, // szeroka kolumna żeby pomieścić "GÓRNA" / "RAMKA"
      align: "center",
      characterSpacing: 0.5,
      lineGap: 1,
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

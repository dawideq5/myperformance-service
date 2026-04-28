import type { VisualConditionState } from "../components/intake/PhoneConfigurator3D";
import {
  BACK_DESCRIPTIONS,
  CAMERA_DESCRIPTIONS,
  DISPLAY_DESCRIPTIONS,
  FRAMES_DESCRIPTIONS,
} from "../components/intake/RatingScale";

export interface ReceiptData {
  ticketNumber: string;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  device: {
    brand: string;
    model: string;
    imei: string;
    color: string;
  };
  lock: {
    type: string;
    code: string;
  };
  description: string;
  visualCondition: VisualConditionState;
  estimate: number | null;
  cleaningPrice: number | null;
  cleaningAccepted: boolean;
  handover: {
    choice: "none" | "items";
    items: string;
  };
}

const LOCK_LABELS: Record<string, string> = {
  none: "Brak blokady",
  pin: "Hasło / PIN",
  pattern: "Wzór",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTimePL(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Pełen tekst regulaminu — statyczny dla P30-A. W P30-B będzie ładowany
 * z Directus (z możliwością edycji w admin panelu). */
const REGULATIONS_TEXT = `
1.1. Właścicielem punktów "Serwis Telefonów Caseownia" oraz strony www.serwis.caseownia.com jest UNIKOM S.C. Krzysztof Rojek, ul. Towarowa 2c, 43-100 Tychy, NIP: 646-283-18-04, REGON: 240976330.
1.2. Regulamin określa zasady świadczenia usług serwisowych oraz sprzedaży produktów w sklepach Caseownia i Smart Connect.
1.5. Klient, przekazując urządzenie do Serwisu, akceptuje warunki niniejszego regulaminu.

2. Przyjęcie urządzenia
2.1. Przyjęcie potwierdzane jest protokołem zawierającym dane Klienta, opis usterki, stan wizualny oraz akcesoria.

3. Wykonywanie usług
3.3. Klient musi zaakceptować kosztorys przed naprawą. Brak akceptacji w ciągu 14 dni może skutkować zwrotem urządzenia bez naprawy.
3.5. Serwis nie ponosi odpowiedzialności za dane w urządzeniu. Klient jest zobowiązany wykonać kopię zapasową.

4. Gwarancja i odpowiedzialność
4.1. Na wykonane naprawy Serwis udziela gwarancji na okres 3 miesięcy, o ile nie uzgodniono inaczej.
4.2. Gwarancja obejmuje jedynie zakres naprawy i użyte części. Nie obejmuje uszkodzeń mechanicznych i zalania.
4.4. Serwis nie gwarantuje zachowania fabrycznej wodoszczelności urządzenia (klasa IP67/IP68 i inne) po dokonanej naprawie.
4.5. Serwis nie bierze odpowiedzialności za uszkodzenie lub konieczność odklejenia szkieł hartowanych oraz folii ochronnych podczas procesu serwisowego.

5. Odbiór urządzenia
5.1. Klient zobowiązany jest odebrać urządzenie w ciągu 21 dni od powiadomienia.
5.3. Jeśli urządzenie nie zostanie odebrane w ciągu 90 dni, Serwis może uznać je za porzucone (art. 180 KC).

6. Reklamacje
6.1. Reklamacje należy zgłaszać pisemnie lub na adres biuro@caseownia.com. Serwis rozpatruje je w ciągu 14 dni.

7. RODO — Ochrona danych osobowych
7.1. Administratorem danych jest UNIKOM S.C. Dane przetwarzane są wyłącznie w celu realizacji zlecenia. Klient ma prawo do wglądu i poprawiania swoich danych.
`.trim();

/** Surface → który widok (front/back/side) i przybliżona pozycja na phone
 * outline (procenty względem viewbox). Pomocne dla rozmieszczenia markerów
 * na technicznym rysunku. */
function projectMarker(
  surface: string,
  m: { x: number; y: number; z: number },
): { view: "front" | "back"; px: number; py: number } {
  // Phone: X axis = depth (display +X / back -X), Y = wysokość, Z = szerokość.
  // Mapowanie do 2D outline: cx (horizontal) ← z, cy (vertical) ← -y (góra=mniej Y).
  const Z_RANGE = 0.85;
  const Y_RANGE = 1.7;
  const cx = ((m.z + Z_RANGE) / (2 * Z_RANGE)) * 100; // 0..100
  const cy = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100; // 0..100
  const s = surface.toLowerCase();
  const view: "front" | "back" =
    s.includes("tylny") || s.includes("aparat") || m.x < 0 ? "back" : "front";
  return {
    view,
    px: Math.max(8, Math.min(92, cx)),
    py: Math.max(6, Math.min(94, cy)),
  };
}

/** SVG technical view — front + back outline iPhone-style + numbered markery. */
function buildTechnicalSvg(
  markers: { id: string; x: number; y: number; z: number; surface?: string }[],
): string {
  if (markers.length === 0) return "";
  const PHONE_W = 100;
  const PHONE_H = 200;
  const phoneOutline = (label: string) => `
    <g>
      <rect x="6" y="6" width="${PHONE_W - 12}" height="${PHONE_H - 12}" rx="14" ry="14" fill="#fafafa" stroke="#222" stroke-width="1.5"/>
      <rect x="14" y="22" width="${PHONE_W - 28}" height="${PHONE_H - 44}" rx="6" ry="6" fill="#fff" stroke="#888" stroke-width="0.7"/>
      <circle cx="${PHONE_W / 2}" cy="14" r="2.5" fill="#444"/>
      <text x="${PHONE_W / 2}" y="${PHONE_H + 12}" font-size="8" font-weight="600" text-anchor="middle" fill="#333" font-family="Inter, sans-serif" letter-spacing="0.5">${label}</text>
    </g>
  `;
  const renderMarkersOn = (view: "front" | "back") =>
    markers
      .map((m, i) => {
        const p = projectMarker(m.surface ?? "", m);
        if (p.view !== view) return "";
        const cx = (p.px / 100) * PHONE_W;
        const cy = (p.py / 100) * PHONE_H;
        return `<g>
          <circle cx="${cx}" cy="${cy}" r="6" fill="#222" stroke="#fff" stroke-width="1.2"/>
          <text x="${cx}" y="${cy + 2.2}" font-size="6" font-weight="700" text-anchor="middle" fill="#fff" font-family="Inter, sans-serif">${i + 1}</text>
        </g>`;
      })
      .join("");
  return `
    <svg viewBox="0 0 ${PHONE_W * 2 + 40} ${PHONE_H + 22}" xmlns="http://www.w3.org/2000/svg" style="width: 220px; height: auto; display: block;">
      <g transform="translate(0,0)">
        ${phoneOutline("PRZÓD")}
        ${renderMarkersOn("front")}
      </g>
      <g transform="translate(${PHONE_W + 40},0)">
        ${phoneOutline("TYŁ")}
        ${renderMarkersOn("back")}
      </g>
    </svg>
  `;
}

/** Mapuje rating value (1-10) na pełny opis z config. */
function ratingDescription(
  category: "display" | "back" | "camera" | "frames",
  value: number | undefined,
): string {
  if (value == null) return "";
  const tables = {
    display: DISPLAY_DESCRIPTIONS,
    back: BACK_DESCRIPTIONS,
    camera: CAMERA_DESCRIPTIONS,
    frames: FRAMES_DESCRIPTIONS,
  };
  return tables[category][value] ?? "";
}

/** Buduje HTML potwierdzenia — grayscale, kompaktowo na A4. Konwertowany
 * na PDF przez html2pdf po stronie klienta. */
export function buildReceiptHTML(data: ReceiptData): string {
  const v = data.visualCondition;
  const markers = v.damage_markers ?? [];
  const techSvg = buildTechnicalSvg(markers);

  const ratingsRows: { cat: "display" | "back" | "camera" | "frames"; label: string; value: number | undefined }[] = [
    { cat: "display", label: "Wyświetlacz", value: v.display_rating },
    { cat: "back", label: "Panel tylny", value: v.back_rating },
    { cat: "camera", label: "Wyspa aparatów", value: v.camera_rating },
    { cat: "frames", label: "Ramki boczne", value: v.frames_rating },
  ];
  const ratingsHtml = ratingsRows
    .filter((r) => r.value != null)
    .map(
      (r) => `<tr>
        <td style="padding:3px 6px; vertical-align:top; border-bottom:1px solid #ddd; width:90px; font-weight:600; color:#222; font-size:9pt;">${escapeHtml(r.label)}</td>
        <td style="padding:3px 6px; border-bottom:1px solid #ddd; font-size:9pt; color:#444;">${escapeHtml(ratingDescription(r.cat, r.value))}</td>
      </tr>`,
    )
    .join("");

  const markersListHtml = markers.length
    ? markers
        .map(
          (m, i) => `<div style="display:flex; gap:6px; margin-bottom:3px; font-size:8.5pt;">
            <span style="display:inline-block; width:14px; height:14px; line-height:14px; text-align:center; background:#222; color:#fff; border-radius:50%; font-size:7pt; font-weight:700; flex-shrink:0;">${i + 1}</span>
            <span><strong style="font-size:7.5pt; text-transform:uppercase; letter-spacing:0.4px; color:#666;">${escapeHtml(m.surface ?? "powierzchnia")}</strong> — ${escapeHtml(m.description?.trim() || "(brak opisu)")}</span>
          </div>`,
        )
        .join("")
    : "";

  const checklistRows: { label: string; value: string }[] = [];
  if (v.powers_on) {
    const lab: Record<string, string> = {
      yes: "Włącza się",
      no: "NIE WŁĄCZA się",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    checklistRows.push({ label: "Status zasilania", value: lab[v.powers_on] });
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
  const checklistHtml = checklistRows
    .map(
      (r) => `<tr>
        <td style="padding:3px 6px; vertical-align:top; border-bottom:1px solid #ddd; width:90px; font-weight:600; color:#222; font-size:9pt;">${escapeHtml(r.label)}</td>
        <td style="padding:3px 6px; border-bottom:1px solid #ddd; font-size:9pt; color:#444;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");

  const repair = data.estimate ?? 0;
  const cleaning =
    data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repair + cleaning;

  const regulationsHtml = REGULATIONS_TEXT.split("\n\n")
    .map(
      (block) =>
        `<p style="margin:0 0 4pt 0;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Potwierdzenie ${escapeHtml(data.ticketNumber)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 8mm 10mm; }
  body {
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    color: #111;
    font-size: 9pt;
    line-height: 1.35;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    filter: grayscale(100%);
  }
  h2 {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #111;
    margin: 8pt 0 4pt 0;
    padding-bottom: 2pt;
    border-bottom: 1.5px solid #111;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-bottom: 8pt;
    border-bottom: 2px solid #111;
    margin-bottom: 8pt;
  }
  .header img { max-height: 50px; max-width: 220px; object-fit: contain; }
  .ticket-block { text-align: right; }
  .ticket-no {
    font-family: Georgia, serif;
    font-size: 16pt;
    font-weight: bold;
    letter-spacing: 1px;
    color: #111;
  }
  .ticket-meta {
    font-size: 7.5pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 1pt;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8pt 14pt;
  }
  .field-label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #666;
    margin-bottom: 1pt;
  }
  .field-value { font-size: 9pt; font-weight: 500; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  .lock-block {
    border: 1px solid #888;
    border-left: 3px solid #111;
    padding: 4pt 8pt;
    margin: 4pt 0;
    background: #f5f5f5;
  }
  .lock-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.6px; color: #555; }
  .lock-code { font-family: "Courier New", monospace; font-size: 11pt; font-weight: bold; color: #111; }
  .description-block {
    background: #f5f5f5;
    border-left: 3px solid #111;
    padding: 5pt 8pt;
    font-size: 8.5pt;
    white-space: pre-wrap;
    margin: 3pt 0;
    color: #222;
  }
  .total-block {
    border: 1.5px solid #111;
    padding: 5pt 10pt;
    margin: 4pt 0;
    background: #fafafa;
  }
  .total-row { display: flex; justify-content: space-between; padding: 1pt 0; font-size: 9pt; }
  .total-final {
    border-top: 1.5px solid #111;
    margin-top: 3pt;
    padding-top: 3pt;
    font-size: 11pt;
    font-weight: bold;
    font-family: Georgia, serif;
  }
  .handover-block {
    border-left: 3px solid #111;
    background: #f5f5f5;
    padding: 5pt 8pt;
    margin: 4pt 0;
    font-size: 8.5pt;
  }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16pt;
    margin-top: 12pt;
  }
  .sig-box {
    border-top: 1px solid #111;
    padding-top: 3pt;
    text-align: center;
    font-size: 7.5pt;
    color: #444;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-height: 28pt;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #aaa;
    padding-top: 4pt;
    margin-top: 8pt;
    font-size: 7pt;
    color: #666;
  }
  .footer img { max-height: 22pt; max-width: 90pt; object-fit: contain; }
  .regulations {
    page-break-before: always;
    font-size: 7.5pt;
    line-height: 1.45;
    color: #333;
    column-count: 2;
    column-gap: 14pt;
  }
  .regulations h2 {
    column-span: all;
    text-align: center;
    margin-bottom: 6pt;
  }
  .tech-row {
    display: flex;
    gap: 12pt;
    align-items: flex-start;
    margin: 4pt 0;
  }
  .tech-svg-wrap { flex-shrink: 0; }
  .tech-list { flex: 1; min-width: 0; }
</style>
</head>
<body>
  <div class="header">
    <img src="${window.location.origin}/logos/serwis-by-caseownia.png" alt="Serwis by Caseownia">
    <div class="ticket-block">
      <div class="ticket-no">${escapeHtml(data.ticketNumber)}</div>
      <div class="ticket-meta">${escapeHtml(formatDateTimePL(data.createdAt))}</div>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <h2 style="margin-top:0;">Klient</h2>
      <div class="field-label">Imię i nazwisko</div>
      <div class="field-value">${escapeHtml(data.customer.firstName)} ${escapeHtml(data.customer.lastName)}</div>
      <div class="field-label" style="margin-top:3pt;">Telefon</div>
      <div class="field-value" style="font-family: Georgia, serif;">${escapeHtml(data.customer.phone)}</div>
      ${
        data.customer.email
          ? `<div class="field-label" style="margin-top:3pt;">Email</div>
             <div class="field-value">${escapeHtml(data.customer.email)}</div>`
          : ""
      }
    </div>
    <div>
      <h2 style="margin-top:0;">Urządzenie</h2>
      <div class="field-label">Model</div>
      <div class="field-value">${escapeHtml(data.device.brand)} ${escapeHtml(data.device.model)}</div>
      <div class="field-label" style="margin-top:3pt;">Kolor</div>
      <div class="field-value">${escapeHtml(data.device.color)}</div>
      <div class="field-label" style="margin-top:3pt;">IMEI</div>
      <div class="field-value" style="font-family: 'Courier New', monospace;">${escapeHtml(data.device.imei)}</div>
    </div>
  </div>

  ${
    data.lock.type !== "none"
      ? `<div class="lock-block">
          <div class="lock-label">${escapeHtml(LOCK_LABELS[data.lock.type] ?? data.lock.type)}</div>
          <div class="lock-code">${escapeHtml(data.lock.code)}</div>
        </div>`
      : ""
  }

  <h2>Opis usterki</h2>
  <div class="description-block">${escapeHtml(data.description || "(brak opisu)")}</div>

  ${
    techSvg
      ? `<h2>Lokalizacja uszkodzeń</h2>
         <div class="tech-row">
           <div class="tech-svg-wrap">${techSvg}</div>
           <div class="tech-list">${markersListHtml}</div>
         </div>`
      : ""
  }

  ${
    ratingsHtml || checklistHtml
      ? `<h2>Stan techniczny</h2>
         <table>${ratingsHtml}${checklistHtml}</table>`
      : ""
  }

  <h2>Wycena orientacyjna</h2>
  <div class="total-block">
    <div class="total-row">
      <span>Naprawa</span>
      <span style="font-family: Georgia, serif;">${repair.toFixed(2)} PLN</span>
    </div>
    ${
      data.cleaningAccepted && data.cleaningPrice != null
        ? `<div class="total-row">
            <span>Czyszczenie urządzenia</span>
            <span style="font-family: Georgia, serif;">${data.cleaningPrice.toFixed(2)} PLN</span>
          </div>`
        : ""
    }
    <div class="total-row total-final">
      <span>Razem orientacyjnie</span>
      <span>${total.toFixed(2)} PLN</span>
    </div>
  </div>

  <h2>Potwierdzenie odbioru</h2>
  ${
    data.handover.choice === "none"
      ? `<div class="handover-block">
          <strong>Potwierdzam</strong>, że przyjmowane urządzenie nie posiada karty SIM, karty pamięci SD ani nie posiadało etui przy przyjęciu.
        </div>`
      : `<div class="handover-block">
          <strong>Pobrane od klienta dodatkowe przedmioty:</strong><br>
          ${escapeHtml(data.handover.items).replace(/\n/g, "<br>")}
        </div>`
  }

  <div class="signatures">
    <div class="sig-box">Podpis pracownika</div>
    <div class="sig-box">Podpis klienta</div>
  </div>

  <div class="footer">
    <span>Serwis Telefonów by Caseownia · UNIKOM S.C.</span>
    <img src="${window.location.origin}/logos/caseownia.jpeg" alt="Caseownia">
  </div>

  <div class="regulations">
    <h2>Regulamin świadczenia usług serwisowych</h2>
    ${regulationsHtml}
  </div>
</body>
</html>`;
}

/** Generuje PDF z receipt HTML i otwiera w nowej karcie (PDF viewer).
 *
 * UWAGA: full HTML z <!DOCTYPE><html><body> NIE może być umieszczony w
 * div.innerHTML — przeglądarka strippuje wrapper tags. Używamy DOMParser
 * który parsuje to jako pełny dokument. */
export async function openReceiptPdf(data: ReceiptData): Promise<boolean> {
  let wrapper: HTMLDivElement | null = null;
  let tempStyle: HTMLStyleElement | null = null;
  try {
    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = (html2pdfModule.default ?? html2pdfModule) as (
      el: HTMLElement,
    ) => {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => {
          outputPdf: (type: "blob") => Promise<Blob>;
        };
      };
    };

    const html = buildReceiptHTML(data);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Wstrzyknij <style> do live document żeby html2canvas zobaczył computed
    // styles na klonowanym wrapper.
    const docStyle = doc.querySelector("style");
    if (docStyle) {
      tempStyle = document.createElement("style");
      tempStyle.dataset.receiptScope = "true";
      tempStyle.textContent = docStyle.textContent ?? "";
      document.head.appendChild(tempStyle);
    }

    wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute; left:-9999px; top:0; width:210mm; background:#ffffff;";
    // Przenieś dzieci z parsed body do live wrapper.
    while (doc.body.firstChild) {
      wrapper.appendChild(doc.body.firstChild);
    }
    document.body.appendChild(wrapper);

    const blob = await html2pdf(wrapper)
      .set({
        margin: [8, 10, 8, 10],
        filename: `Potwierdzenie-${data.ticketNumber}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(wrapper)
      .outputPdf("blob");

    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // Popup blocker — fallback download.
      const a = document.createElement("a");
      a.href = url;
      a.download = `Potwierdzenie-${data.ticketNumber}.pdf`;
      a.click();
    }
    return true;
  } catch (err) {
    console.error("[receipt] PDF generation failed:", err);
    alert(
      `Nie udało się wygenerować potwierdzenia: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  } finally {
    if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    if (tempStyle && tempStyle.parentNode)
      tempStyle.parentNode.removeChild(tempStyle);
  }
}

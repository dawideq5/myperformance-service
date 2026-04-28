import type { VisualConditionState } from "../components/intake/PhoneConfigurator3D";

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
    type: string; // none / pin / pattern
    code: string;
  };
  description: string;
  visualCondition: VisualConditionState;
  estimate: number | null;
  cleaningPrice: number | null;
  cleaningAccepted: boolean;
  handover: {
    sdRemoved: "yes" | "no" | "na" | null;
    simRemoved: "yes" | "no" | "na" | null;
    caseReturned: "yes" | "no" | "na" | null;
  };
}

const HANDOVER_LABELS: Record<string, string> = {
  yes: "Wyjęta / Zwrócone",
  no: "POZOSTAWIONA W URZĄDZENIU",
  na: "Brak",
};

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

/** Buduje HTML potwierdzenia odbioru — full inline CSS dla print
 * (window.open w nowej karcie). Zawiera oba loga (serwis nagłówek,
 * caseownia stopka), wszystkie dane zlecenia, miejsce na podpisy. */
export function buildReceiptHTML(data: ReceiptData): string {
  const v = data.visualCondition;
  const ratings: { label: string; value: number | undefined }[] = [
    { label: "Wyświetlacz", value: v.display_rating },
    { label: "Panel tylny", value: v.back_rating },
    { label: "Wyspa aparatów", value: v.camera_rating },
    { label: "Ramki boczne", value: v.frames_rating },
  ];
  const ratingsHtml = ratings
    .filter((r) => r.value != null)
    .map(
      (r) => `<tr>
        <td style="padding:4px 8px; border-bottom:1px solid #eee;">${escapeHtml(r.label)}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #eee; text-align:right; font-family: Georgia, serif; font-weight:bold;">${r.value}/10</td>
      </tr>`,
    )
    .join("");

  const markers = v.damage_markers ?? [];
  const markersHtml = markers.length
    ? `<table style="width:100%; border-collapse:collapse; margin-top:8px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 8px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">#</th>
            <th style="padding:6px 8px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Powierzchnia</th>
            <th style="padding:6px 8px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Opis</th>
          </tr>
        </thead>
        <tbody>
          ${markers
            .map(
              (m, i) => `<tr>
                <td style="padding:4px 8px; border-bottom:1px solid #eee; vertical-align:top;">${i + 1}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #eee; vertical-align:top;">${escapeHtml(m.surface ?? "powierzchnia")}</td>
                <td style="padding:4px 8px; border-bottom:1px solid #eee;">${escapeHtml(m.description?.trim() || "(brak opisu)")}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
    : "";

  const checklistRows: { label: string; value: string }[] = [];
  if (v.powers_on) {
    const lab: Record<string, string> = {
      yes: "Tak",
      no: "Nie",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    checklistRows.push({ label: "Włącza się", value: lab[v.powers_on] });
  }
  if (v.cracked_front != null) {
    checklistRows.push({
      label: "Pęknięty z przodu",
      value: v.cracked_front ? "Tak" : "Nie",
    });
  }
  if (v.cracked_back != null) {
    checklistRows.push({
      label: "Pęknięty z tyłu",
      value: v.cracked_back ? "Tak" : "Nie",
    });
  }
  if (v.bent != null) {
    checklistRows.push({ label: "Wygięty", value: v.bent ? "Tak" : "Nie" });
  }
  if (v.face_touch_id != null) {
    checklistRows.push({
      label: "Face ID / Touch ID działa",
      value: v.face_touch_id ? "Tak" : "Nie",
    });
  }
  if (v.water_damage) {
    const lab: Record<string, string> = {
      yes: "Tak",
      no: "Nie",
      unknown: "Nie wiadomo",
    };
    checklistRows.push({ label: "Zalany", value: lab[v.water_damage] });
  }
  if (v.charging_current != null) {
    checklistRows.push({
      label: "Prąd ładowania",
      value: `${v.charging_current.toFixed(2)} A`,
    });
  }
  const checklistHtml = checklistRows.length
    ? checklistRows
        .map(
          (r) => `<tr>
            <td style="padding:4px 8px; border-bottom:1px solid #eee;">${escapeHtml(r.label)}</td>
            <td style="padding:4px 8px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${escapeHtml(r.value)}</td>
          </tr>`,
        )
        .join("")
    : "";

  const repairTotal = data.estimate ?? 0;
  const cleaningTotal =
    data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repairTotal + cleaningTotal;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Potwierdzenie przyjęcia ${escapeHtml(data.ticketNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    body {
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      color: #111;
      font-size: 11pt;
      line-height: 1.45;
      margin: 0;
      padding: 12pt 16pt;
    }
    h1, h2, h3 { margin: 0; font-weight: 600; }
    h2 {
      font-size: 12pt;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #444;
      border-bottom: 2px solid #111;
      padding-bottom: 4px;
      margin: 18pt 0 8pt 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 16pt;
      border-bottom: 2px solid #111;
    }
    .header img.logo-main { max-height: 80px; max-width: 380px; object-fit: contain; }
    .ticket-block {
      text-align: right;
      font-family: Georgia, serif;
    }
    .ticket-no {
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .ticket-date { color: #666; font-size: 10pt; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16pt 24pt;
      margin: 6pt 0;
    }
    .field-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
    .field-value { font-size: 11pt; font-weight: 500; }
    .lock-block {
      background: #fff8e1;
      border: 1px solid #ffd54f;
      border-radius: 4px;
      padding: 8pt 12pt;
      margin: 6pt 0;
    }
    .lock-label { font-size: 9pt; text-transform: uppercase; color: #b58900; }
    .lock-code { font-family: "Courier New", monospace; font-size: 13pt; font-weight: bold; letter-spacing: 1px; }
    .description-block {
      background: #f9f9f9;
      border-left: 3px solid #06b6d4;
      padding: 8pt 12pt;
      margin: 6pt 0;
      white-space: pre-wrap;
    }
    .total-block {
      background: linear-gradient(135deg, #e0f2fe, #f0f9ff);
      border: 1px solid #0ea5e9;
      border-radius: 4px;
      padding: 10pt 14pt;
      margin: 8pt 0;
    }
    .total-row { display:flex; justify-content:space-between; font-size: 11pt; padding: 2pt 0; }
    .total-final {
      border-top: 2px solid #0ea5e9;
      margin-top: 6pt;
      padding-top: 6pt;
      font-size: 14pt;
      font-weight: bold;
      color: #0369a1;
      font-family: Georgia, serif;
    }
    .handover-table { width: 100%; margin: 6pt 0; }
    .handover-table th { text-align: left; padding: 6pt 8pt; background: #f5f5f5; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
    .handover-table td { padding: 6pt 8pt; border-bottom: 1px solid #eee; }
    .signatures {
      margin-top: 28pt;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32pt;
    }
    .sig-box {
      border-top: 1px solid #111;
      padding-top: 6pt;
      text-align: center;
      font-size: 10pt;
      color: #666;
      min-height: 60pt;
    }
    .footer {
      margin-top: 32pt;
      padding-top: 12pt;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9pt;
      color: #888;
    }
    .footer img { max-height: 30pt; max-width: 120pt; object-fit: contain; }
    .legal {
      margin-top: 18pt;
      font-size: 8.5pt;
      color: #666;
      line-height: 1.4;
      padding: 8pt 12pt;
      background: #fafafa;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="logo-main" src="${window.location.origin}/logos/serwis-by-caseownia.png" alt="Serwis by Caseownia">
    <div class="ticket-block">
      <div class="field-label">Nr zlecenia</div>
      <div class="ticket-no">${escapeHtml(data.ticketNumber)}</div>
      <div class="ticket-date">${escapeHtml(formatDateTimePL(data.createdAt))}</div>
    </div>
  </div>

  <h2>Klient</h2>
  <div class="info-grid">
    <div>
      <div class="field-label">Imię i nazwisko</div>
      <div class="field-value">${escapeHtml(data.customer.firstName)} ${escapeHtml(data.customer.lastName)}</div>
    </div>
    <div>
      <div class="field-label">Telefon</div>
      <div class="field-value" style="font-family: Georgia, serif;">${escapeHtml(data.customer.phone)}</div>
    </div>
    ${
      data.customer.email
        ? `<div style="grid-column: 1 / -1;">
            <div class="field-label">Email</div>
            <div class="field-value">${escapeHtml(data.customer.email)}</div>
          </div>`
        : ""
    }
  </div>

  <h2>Urządzenie</h2>
  <div class="info-grid">
    <div>
      <div class="field-label">Marka i model</div>
      <div class="field-value">${escapeHtml(data.device.brand)} ${escapeHtml(data.device.model)}</div>
    </div>
    <div>
      <div class="field-label">Kolor</div>
      <div class="field-value">${escapeHtml(data.device.color)}</div>
    </div>
    <div>
      <div class="field-label">IMEI</div>
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
    ratingsHtml
      ? `<h2>Stan wizualny</h2>
        <table>${ratingsHtml}</table>`
      : ""
  }

  ${
    markersHtml
      ? `<h3 style="margin-top:8pt; font-size:10pt; text-transform:uppercase; letter-spacing:0.5px; color:#444;">Markery uszkodzeń</h3>
         ${markersHtml}`
      : ""
  }

  ${
    checklistHtml
      ? `<h3 style="margin-top:12pt; font-size:10pt; text-transform:uppercase; letter-spacing:0.5px; color:#444;">Test funkcjonalny</h3>
         <table>${checklistHtml}</table>`
      : ""
  }

  <h2>Wycena orientacyjna</h2>
  <div class="total-block">
    <div class="total-row">
      <span>Naprawa</span>
      <span style="font-family: Georgia, serif;">${repairTotal.toFixed(2)} PLN</span>
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
  <table class="handover-table">
    <tr>
      <th>Pozycja</th>
      <th style="text-align:right;">Status</th>
    </tr>
    <tr>
      <td>Karta pamięci SD</td>
      <td style="text-align:right; font-weight:600;">${escapeHtml(HANDOVER_LABELS[data.handover.sdRemoved ?? "na"])}</td>
    </tr>
    <tr>
      <td>Karta SIM</td>
      <td style="text-align:right; font-weight:600;">${escapeHtml(HANDOVER_LABELS[data.handover.simRemoved ?? "na"])}</td>
    </tr>
    <tr>
      <td>Etui zwrócone klientowi</td>
      <td style="text-align:right; font-weight:600;">${escapeHtml(HANDOVER_LABELS[data.handover.caseReturned ?? "na"])}</td>
    </tr>
  </table>

  <div class="legal">
    Powyższe potwierdzenie stanowi pokwitowanie przyjęcia urządzenia do
    serwisu. Wycena ma charakter orientacyjny — ostateczna kwota zostanie
    ustalona po diagnostyce. Klient zobowiązuje się do odbioru urządzenia
    w terminie do 30 dni od powiadomienia o gotowości. Po tym czasie
    serwis może naliczyć opłatę za przechowywanie.
  </div>

  <div class="signatures">
    <div class="sig-box">Podpis pracownika</div>
    <div class="sig-box">Podpis klienta</div>
  </div>

  <div class="footer">
    <span>Serwis Telefonów by Caseownia</span>
    <img src="${window.location.origin}/logos/caseownia.jpeg" alt="Caseownia">
  </div>

  <script>
    // Auto-print po załadowaniu wszystkich obrazów. Setlik ułatwia
    // user wciśnięcie Anuluj jeśli chce tylko podejrzeć.
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 350);
    });
  </script>
</body>
</html>`;
}

/** Otwiera nowe okno z potwierdzeniem do druku. Zwraca true jeśli się
 * udało, false gdy popup blocker zatrzymał. */
export function openReceiptPrint(data: ReceiptData): boolean {
  const html = buildReceiptHTML(data);
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

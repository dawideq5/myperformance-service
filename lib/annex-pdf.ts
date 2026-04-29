import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface AnnexInput {
  ticketNumber: string;
  serviceCreatedAt: string;
  customer: { firstName: string; lastName: string };
  device: { brand: string; model: string; imei: string };
  editor: { name: string; email: string };
  changes: { field: string; before: string; after: string }[];
  summary: string;
  issuedAt: string;
}

const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const ACCENT = "#1e40af";

function findFont(...candidates: string[]): string | null {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function regularFont(): string {
  return (
    findFont(
      path.join(process.cwd(), "public/fonts/Roboto-Regular.ttf"),
      path.join(process.cwd(), "fonts/Roboto-Regular.ttf"),
    ) ?? "Helvetica"
  );
}

function boldFont(): string {
  return (
    findFont(
      path.join(process.cwd(), "public/fonts/Roboto-Bold.ttf"),
      path.join(process.cwd(), "fonts/Roboto-Bold.ttf"),
    ) ?? "Helvetica-Bold"
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pl-PL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function renderAnnexPdf(data: AnnexInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
        info: { Title: `Aneks ${data.ticketNumber}` },
      });

      doc.registerFont("R", regularFont());
      doc.registerFont("B", boldFont());

      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const M = 36;
      const W = 595 - 2 * M;

      // === HEADER ===
      doc.font("B").fontSize(18).fillColor(ACCENT)
        .text("ANEKS DO ZLECENIA SERWISOWEGO", M, M);
      doc.font("R").fontSize(9).fillColor(MUTED)
        .text(
          `Wystawiony ${fmtDate(data.issuedAt)} przez ${data.editor.name}`,
          M,
          M + 22,
        );

      let y = M + 50;
      doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).strokeColor(BORDER).stroke();
      y += 12;

      // === META ===
      const metaCol = (label: string, value: string, x: number, yy: number, w: number) => {
        doc.font("R").fontSize(7.5).fillColor(MUTED)
          .text(label.toUpperCase(), x, yy, { width: w, characterSpacing: 0.4 });
        doc.font("B").fontSize(10).fillColor(TEXT)
          .text(value, x, yy + 10, { width: w });
      };

      const colW = (W - 16) / 3;
      metaCol("Numer zlecenia", data.ticketNumber, M, y, colW);
      metaCol(
        "Klient",
        `${data.customer.firstName} ${data.customer.lastName}`.trim() || "—",
        M + colW + 8,
        y,
        colW,
      );
      metaCol(
        "Urządzenie",
        `${data.device.brand} ${data.device.model}`.trim() || "—",
        M + 2 * (colW + 8),
        y,
        colW,
      );
      y += 36;

      doc.font("R").fontSize(9).fillColor(MUTED)
        .text(
          `IMEI: ${data.device.imei || "—"}    |    Pierwotne przyjęcie: ${fmtDate(data.serviceCreatedAt)}`,
          M,
          y,
        );
      y += 24;

      // === SUMMARY ===
      doc.font("B").fontSize(11).fillColor(TEXT).text("Podsumowanie zmian", M, y);
      y += 16;
      doc.font("R").fontSize(10).fillColor(TEXT)
        .text(data.summary, M, y, { width: W });
      y += doc.heightOfString(data.summary, { width: W }) + 16;

      // === CHANGES TABLE ===
      doc.font("B").fontSize(9).fillColor(MUTED)
        .text("POLE", M, y, { width: W * 0.3 });
      doc.font("B").fontSize(9).fillColor(MUTED)
        .text("PRZED", M + W * 0.3, y, { width: W * 0.35 });
      doc.font("B").fontSize(9).fillColor(MUTED)
        .text("PO", M + W * 0.65, y, { width: W * 0.35 });
      y += 12;
      doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.6).strokeColor(BORDER).stroke();
      y += 6;

      for (const ch of data.changes) {
        const rowH = Math.max(
          doc.font("R").fontSize(9).heightOfString(ch.field, { width: W * 0.3 - 8 }),
          doc.heightOfString(ch.before, { width: W * 0.35 - 8 }),
          doc.heightOfString(ch.after, { width: W * 0.35 - 8 }),
        );
        doc.font("B").fontSize(9).fillColor(TEXT)
          .text(ch.field, M, y, { width: W * 0.3 - 8 });
        doc.font("R").fontSize(9).fillColor(MUTED)
          .text(ch.before, M + W * 0.3, y, { width: W * 0.35 - 8 });
        doc.font("R").fontSize(9).fillColor(TEXT)
          .text(ch.after, M + W * 0.65, y, { width: W * 0.35 - 8 });
        y += rowH + 8;
        doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.4).strokeColor(BORDER).stroke();
        y += 6;
        if (y > 720) break; // hard stop — single page
      }

      // === SIGNATURES ===
      y = Math.max(y + 16, 680);
      const sigW = (W - 24) / 2;
      doc.font("B").fontSize(8).fillColor(MUTED)
        .text("PODPIS PRACOWNIKA", M, y);
      doc.font("B").fontSize(8).fillColor(MUTED)
        .text("PODPIS KLIENTA", M + sigW + 24, y);
      y += 36;
      doc.moveTo(M, y).lineTo(M + sigW, y).lineWidth(0.5).strokeColor(TEXT).stroke();
      doc.moveTo(M + sigW + 24, y).lineTo(M + W, y).lineWidth(0.5).strokeColor(TEXT).stroke();
      y += 6;
      doc.font("R").fontSize(7.5).fillColor(MUTED)
        .text(data.editor.name, M, y, { width: sigW });
      doc.text(
        `${data.customer.firstName} ${data.customer.lastName}`.trim() || "—",
        M + sigW + 24,
        y,
        { width: sigW },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

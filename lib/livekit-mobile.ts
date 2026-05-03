/**
 * Wave 23 (overlay) — Mobile publisher URL + QR helpers.
 *
 * Sprzedawca generuje QR w intake formularzu (browser camera nie jest
 * używana — flow przesunięty na mobilny telefon klienta/sprzedawcy).
 * Mobile skanuje QR → otwiera `https://upload.myperformance.pl/livestream?room=X&token=Y`.
 *
 * `livekitUrl` NIE jest częścią URL'a — PWA czyta `NEXT_PUBLIC_LIVEKIT_URL`
 * z env (build-time inlined). Plus: krótszy QR = mniejsza powierzchnia
 * błędów skanu + brak możliwości zmiany serwera podstawieniem URL'a.
 */
import QRCode from "qrcode";

import { getOptionalEnv } from "@/lib/env";

/**
 * Default base URL dla upload-bridge PWA. Env override przez
 * `UPLOAD_BRIDGE_URL` (server-side) — w prod to `https://upload.myperformance.pl`,
 * w dev `http://localhost:3000` (jeśli odpalono per `npm run dev` w
 * apps/upload-bridge) lub `http://localhost:3001`.
 */
const DEFAULT_UPLOAD_BRIDGE_URL = "https://upload.myperformance.pl";

export function getUploadBridgeBase(): string {
  return (
    getOptionalEnv("UPLOAD_BRIDGE_URL").trim().replace(/\/$/, "") ||
    DEFAULT_UPLOAD_BRIDGE_URL
  );
}

export function buildMobilePublisherUrl(roomName: string, token: string): string {
  const base = getUploadBridgeBase();
  const r = encodeURIComponent(roomName);
  const t = encodeURIComponent(token);
  return `${base}/livestream?room=${r}&token=${t}`;
}

/**
 * QR code as data URL (image/png base64). Margin 2 (default), ECC level
 * `M` — wystarczająco odporne na zabrudzenia camery, nie balonuje rozmiaru
 * obrazka. Width 256 → ~5KB data URL, dobrze widoczne na laptop screen.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 256,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}

import { sendMail } from "@/lib/smtp";

const ROLE_LABELS: Record<string, string> = {
  sprzedawca: "Panel Sprzedawcy",
  serwisant: "Panel Serwisanta",
  kierowca: "Panel Kierowcy",
  dokumenty_access: "Obieg dokumentów",
};

function rolesLabelOf(roles: string[]): string {
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(", ");
}

function plDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function deliveryHtml(input: {
  commonName: string;
  rolesLabel: string;
  notAfter: string;
  password: string;
  filename: string;
}): string {
  return `<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f4f4f6;margin:0;padding:24px;color:#111">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <h1 style="margin:0 0 8px;font-size:22px">Cześć ${input.commonName} 👋</h1>
  <p style="margin:0 0 16px;color:#444">Otrzymujesz certyfikat klienta, który otwiera dostęp do paneli MyPerformance.</p>

  <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#666">Subject</td><td style="padding:6px 0;font-family:monospace">${input.commonName}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Role</td><td style="padding:6px 0">${input.rolesLabel}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Ważny do</td><td style="padding:6px 0">${input.notAfter}</td></tr>
  </table>

  <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin:16px 0">
    <div style="font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">Hasło do pliku .p12</div>
    <div style="font-family:monospace;font-size:16px;color:#111">${input.password}</div>
    <div style="font-size:12px;color:#92400e;margin-top:6px">To hasło jest wymagane przy imporcie certyfikatu. Nie pojawi się ponownie — zapisz je w bezpiecznym miejscu.</div>
  </div>

  <h2 style="font-size:16px;margin:24px 0 8px">Instalacja na Windows</h2>
  <ol style="padding-left:20px;color:#333;font-size:14px;line-height:1.6">
    <li>Pobierz załączony plik <code>${input.filename}</code>.</li>
    <li>Kliknij dwukrotnie plik — uruchomi się <em>Kreator importu certyfikatów</em>.</li>
    <li>Wybierz lokalizację <strong>Bieżący użytkownik</strong> i kliknij Dalej.</li>
    <li>Wprowadź hasło (powyżej). Zaznacz <em>Oznacz klucz jako eksportowalny</em>.</li>
    <li>Wybierz automatyczny wybór magazynu certyfikatów — Dalej — Zakończ.</li>
    <li>Otwórz panel w przeglądarce (Edge/Chrome) — system zapyta o certyfikat, wybierz swój.</li>
  </ol>

  <h2 style="font-size:16px;margin:24px 0 8px">Instalacja na macOS</h2>
  <ol style="padding-left:20px;color:#333;font-size:14px;line-height:1.6">
    <li>Pobierz załączony plik <code>${input.filename}</code>.</li>
    <li>Kliknij dwukrotnie — otworzy się <em>Dostęp do pęku kluczy</em>.</li>
    <li>Jako pęk wybierz <strong>login</strong>. Wprowadź hasło do pliku (powyżej).</li>
    <li>Wpisz hasło macOS, aby zatwierdzić import.</li>
    <li>Otwórz Safari/Chrome i wejdź na adres panelu — wybierz certyfikat gdy zostaniesz o to poproszony.</li>
    <li><em>Opcjonalnie:</em> w Pęku kluczy otwórz zaimportowany cert, ustaw <em>Zaufanie → Zawsze ufaj</em>, jeśli macOS ostrzega.</li>
  </ol>

  <p style="margin:24px 0 0;font-size:13px;color:#666">Problem z importem? Odpowiedz na tę wiadomość — pomożemy.</p>
</div>
<p style="text-align:center;font-size:12px;color:#999;margin:18px 0 0">MyPerformance · noreply@myperformance.pl</p>
</body>
</html>`;
}

function revocationHtml(input: {
  commonName: string;
  rolesLabel: string;
  revokedAt: string;
  reason?: string;
}): string {
  return `<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f4f4f6;margin:0;padding:24px;color:#111">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <h1 style="margin:0 0 8px;font-size:22px">Certyfikat został unieważniony</h1>
  <p style="margin:0 0 16px;color:#444">Informujemy, że Twój certyfikat dostępu do paneli MyPerformance został unieważniony. Od tej chwili nie otworzy on zamkniętych paneli.</p>

  <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#666">Subject</td><td style="padding:6px 0;font-family:monospace">${input.commonName}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Role</td><td style="padding:6px 0">${input.rolesLabel}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Unieważniono</td><td style="padding:6px 0">${input.revokedAt}</td></tr>
    ${input.reason ? `<tr><td style="padding:6px 0;color:#666">Powód</td><td style="padding:6px 0">${input.reason}</td></tr>` : ""}
  </table>

  <div style="background:#fee2e2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:16px 0">
    <div style="font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">Co robić?</div>
    <div style="font-size:14px;color:#7f1d1d">Jeśli to pomyłka lub chcesz przywrócić dostęp, skontaktuj się z administratorem. Stary plik <code>.p12</code> możesz usunąć z magazynu certyfikatów systemu/przeglądarki.</div>
  </div>

  <p style="margin:24px 0 0;font-size:13px;color:#666">To jest wiadomość automatyczna — odpowiedź trafi do administracji.</p>
</div>
<p style="text-align:center;font-size:12px;color:#999;margin:18px 0 0">MyPerformance · noreply@myperformance.pl</p>
</body>
</html>`;
}

export interface CertDeliveryInput {
  email: string;
  commonName: string;
  roles: string[];
  notAfterIso: string;
  password: string;
  p12: Buffer;
  filename: string;
}

export async function sendCertificateByEmail(input: CertDeliveryInput): Promise<void> {
  const rolesLabel = rolesLabelOf(input.roles);
  const html = deliveryHtml({
    commonName: input.commonName,
    rolesLabel,
    notAfter: plDate(input.notAfterIso),
    password: input.password,
    filename: input.filename,
  });

  await sendMail({
    to: input.email,
    subject: "Twój certyfikat dostępu — MyPerformance",
    html,
    text: `Cześć ${input.commonName}, w załączniku znajdziesz plik ${input.filename} z certyfikatem. Hasło do .p12: ${input.password}`,
    attachments: [
      {
        filename: input.filename,
        content: input.p12,
        contentType: "application/x-pkcs12",
      },
    ],
  });
}

export interface CertRevocationInput {
  email: string;
  commonName: string;
  roles: string[];
  revokedAtIso: string;
  reason?: string;
}

export async function sendCertificateRevokedEmail(input: CertRevocationInput): Promise<void> {
  const rolesLabel = rolesLabelOf(input.roles);
  const html = revocationHtml({
    commonName: input.commonName,
    rolesLabel,
    revokedAt: plDate(input.revokedAtIso),
    reason: input.reason,
  });

  await sendMail({
    to: input.email,
    subject: "Twój certyfikat MyPerformance został unieważniony",
    html,
    text: `Certyfikat ${input.commonName} (${rolesLabel}) został unieważniony ${plDate(input.revokedAtIso)}.`,
  });
}

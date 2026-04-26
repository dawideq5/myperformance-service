/**
 * KC-friendly warianty szablonów email — Keycloak FreeMarker email templates
 * resolwują przez `${msg("key", arg0, arg1, ...)}` z numerowanymi placeholderami.
 * Nasze wewnętrzne szablony używają składni Mustache `{{var}}`, więc dla KC
 * trzymamy oddzielną wersję z {0}, {1}, {2} zgodną z KC base theme.
 *
 * Argumenty per template (źródło: KC source, theme/base/email/html/*.ftl):
 *
 *   passwordReset:
 *     {0} = linkExpiration formatted (np. "1 dzień")
 *     {1} = realmName
 *     {2} = link (URL)
 *
 *   executeActions:
 *     {0} = realmName
 *     {1} = requiredActions (lista akcji jako string)
 *     {2} = link
 *     {3} = linkExpiration
 *
 *   emailVerification:
 *     {0} = link
 *     {1} = linkExpiration
 *     {2} = realmName
 *
 *   emailUpdateConfirmation:
 *     {0} = link
 *     {1} = linkExpiration
 *     {2} = newEmailAddress
 *
 *   identityProviderLink:
 *     {0} = realmName
 *     {1} = identityProviderAlias
 *     {2} = link
 *     {3} = linkExpiration
 */

export interface KcLocalizationVariant {
  /** PL subject — KC ${msg("...Subject", ...)} */
  subject: string;
  /** PL plain body — KC ${msg("...Body", ...)} */
  body: string;
  /** PL HTML body — KC ${msg("...BodyHtml", ...)} */
  bodyHtml: string;
}

export const KC_LOCALIZATION_VARIANTS: Record<string, KcLocalizationVariant> = {
  "auth.password-reset": {
    subject: "Resetowanie hasła — MyPerformance",
    body: `Cześć,

Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta {1}. Kliknij poniższy link, aby ustawić nowe hasło:

{2}

Link jest jednorazowy i wygasa za {0}.

Wskazówki bezpieczeństwa:
• Wybierz hasło o długości co najmniej 12 znaków
• Połącz duże i małe litery, cyfry oraz znaki specjalne
• Nie używaj tego samego hasła co w innych serwisach
• Pracownicy MyPerformance nigdy nie poproszą o hasło telefonicznie ani mailem

Jeśli to nie Ty prosiłeś o reset, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.

— Zespół MyPerformance`,
    bodyHtml: `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Reset hasła</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#1a1a1f;">
<div style="padding:40px 20px">
<table align="center" role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
<tr><td style="background:#0c0c0e;padding:32px 24px;text-align:center"><p style="color:#fff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em">MyPerformance</p></td></tr>
<tr><td style="padding:36px 32px;line-height:1.6;font-size:15px;color:#374151">
<h1 style="font-size:22px;color:#0c0c0e;margin:0 0 20px;font-weight:700">Reset hasła</h1>
<p style="margin:0 0 16px">Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta <strong>{1}</strong>.</p>
<div style="text-align:center;margin:28px 0">
<a href="{2}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Ustaw nowe hasło</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Link jest jednorazowy i wygasa za <strong>{0}</strong>.</p>
<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin:24px 0;border-radius:4px;font-size:13px;color:#78350f">
<strong>Wskazówki bezpieczeństwa:</strong><br>
• Hasło: minimum 12 znaków, duże + małe litery, cyfry, znaki specjalne<br>
• Nie używaj tego samego hasła co w innych serwisach<br>
• Pracownicy MyPerformance nigdy nie poproszą o hasło mailem ani telefonicznie
</div>
<p style="margin:24px 0 0;color:#9ca3af;font-size:12px">Nie prosiłeś o reset? Zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">© MyPerformance · automatyczna wiadomość</td></tr>
</table>
</div></body></html>`,
  },

  "auth.required-actions": {
    subject: "Wymagana akcja na koncie MyPerformance",
    body: `Cześć,

Administrator konta {0} zlecił wykonanie następujących czynności:

{1}

Kliknij link, aby przejść do bezpiecznego ekranu wykonania:

{2}

Link wygasa za {3}. Po wygaśnięciu zaloguj się ponownie — system zaproponuje akcje od nowa.

— Zespół MyPerformance`,
    bodyHtml: `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Wymagana akcja</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#1a1a1f;">
<div style="padding:40px 20px">
<table align="center" role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
<tr><td style="background:#0c0c0e;padding:32px 24px;text-align:center"><p style="color:#fff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em">MyPerformance</p></td></tr>
<tr><td style="padding:36px 32px;line-height:1.6;font-size:15px;color:#374151">
<h1 style="font-size:22px;color:#0c0c0e;margin:0 0 20px;font-weight:700">Wymagana akcja na koncie</h1>
<p style="margin:0 0 16px">Administrator konta <strong>{0}</strong> zlecił wykonanie kilku czynności na Twoim koncie:</p>
<div style="background:#eef2ff;border-left:3px solid #6366f1;padding:14px 18px;margin:20px 0;border-radius:4px;font-size:14px;color:#3730a3">
{1}
</div>
<p style="margin:16px 0">Cały proces zajmuje zwykle 1–2 minuty.</p>
<div style="text-align:center;margin:28px 0">
<a href="{2}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Wykonaj akcje</a>
</div>
<p style="margin:0 0 0;color:#6b7280;font-size:13px">Link wygasa za <strong>{3}</strong>. Po wygaśnięciu zaloguj się ponownie — system zaproponuje akcje od nowa.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">© MyPerformance · automatyczna wiadomość</td></tr>
</table>
</div></body></html>`,
  },

  "auth.account-activation": {
    subject: "Aktywuj konto w MyPerformance",
    body: `Cześć,

Twoje konto w {2} zostało utworzone. Aby je aktywować i ustawić hasło, kliknij poniższy link:

{0}

Link wygasa za {1}. Po wygaśnięciu poproś administratora o ponowne wygenerowanie linka.

Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — bez kliknięcia w link konto pozostaje nieaktywne.

— Zespół MyPerformance`,
    bodyHtml: `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Aktywuj konto</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#1a1a1f;">
<div style="padding:40px 20px">
<table align="center" role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
<tr><td style="background:#0c0c0e;padding:32px 24px;text-align:center"><p style="color:#fff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em">MyPerformance</p></td></tr>
<tr><td style="padding:36px 32px;line-height:1.6;font-size:15px;color:#374151">
<h1 style="font-size:22px;color:#0c0c0e;margin:0 0 20px;font-weight:700">Aktywuj swoje konto</h1>
<p style="margin:0 0 16px">Twoje konto w <strong>{2}</strong> zostało utworzone. Aby je aktywować i ustawić hasło, kliknij poniższy przycisk.</p>
<div style="text-align:center;margin:28px 0">
<a href="{0}" style="display:inline-block;padding:14px 32px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Aktywuj konto</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Link wygasa za <strong>{1}</strong>. Po wygaśnięciu poproś administratora o ponowne wygenerowanie linka.</p>
<p style="margin:16px 0 0;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px">Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — bez kliknięcia w link konto pozostaje nieaktywne.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">© MyPerformance · automatyczna wiadomość</td></tr>
</table>
</div></body></html>`,
  },

  "auth.email-update": {
    subject: "Potwierdź nowy adres email — MyPerformance",
    body: `Cześć,

W ustawieniach Twojego konta zmieniono adres email na {2}. Aby zmiana stała się skuteczna, kliknij link potwierdzający:

{0}

Link jest jednorazowy i wygasa za {1}.

To nie Ty? Zignoruj tę wiadomość — adres email nie zostanie zmieniony.

— Zespół MyPerformance`,
    bodyHtml: `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Potwierdź adres email</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#1a1a1f;">
<div style="padding:40px 20px">
<table align="center" role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
<tr><td style="background:#0c0c0e;padding:32px 24px;text-align:center"><p style="color:#fff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em">MyPerformance</p></td></tr>
<tr><td style="padding:36px 32px;line-height:1.6;font-size:15px;color:#374151">
<h1 style="font-size:22px;color:#0c0c0e;margin:0 0 20px;font-weight:700">Potwierdź nowy adres email</h1>
<p style="margin:0 0 16px">W ustawieniach Twojego konta zmieniono adres email na <strong>{2}</strong>. Aby zmiana stała się skuteczna, potwierdź że jesteś właścicielem tej skrzynki.</p>
<div style="text-align:center;margin:28px 0">
<a href="{0}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Potwierdź adres email</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Link jest jednorazowy i wygasa za <strong>{1}</strong>.</p>
<p style="margin:16px 0 0;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px">To nie Ty? Zignoruj tę wiadomość — adres email nie zostanie zmieniony. Dla bezpieczeństwa zalecamy także zalogowanie się do konta i sprawdzenie listy aktywnych sesji.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">© MyPerformance · automatyczna wiadomość</td></tr>
</table>
</div></body></html>`,
  },

  "auth.idp-link": {
    subject: "Połącz konto z dostawcą zewnętrznym — MyPerformance",
    body: `Cześć,

Próbujesz zalogować się do {0} przez {1}, ale na ten adres email mamy już istniejące konto. Aby uniknąć zduplikowania, łączymy te dwa logowania w jedno.

Kliknij link, aby połączyć konta:

{2}

Link wygasa za {3}.

To nie Ty? Zignoruj tę wiadomość — bez kliknięcia konta pozostają niezależne.

— Zespół MyPerformance`,
    bodyHtml: `<!DOCTYPE html>
<html lang="pl"><head><meta charset="UTF-8"><title>Połącz konta</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#1a1a1f;">
<div style="padding:40px 20px">
<table align="center" role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06)">
<tr><td style="background:#0c0c0e;padding:32px 24px;text-align:center"><p style="color:#fff;font-size:28px;font-weight:800;margin:0;letter-spacing:-0.02em">MyPerformance</p></td></tr>
<tr><td style="padding:36px 32px;line-height:1.6;font-size:15px;color:#374151">
<h1 style="font-size:22px;color:#0c0c0e;margin:0 0 20px;font-weight:700">Połącz konto z {1}</h1>
<p style="margin:0 0 16px">Próbujesz zalogować się do <strong>{0}</strong> przez <strong>{1}</strong>, ale na ten adres email mamy już istniejące konto. Aby uniknąć zduplikowania, łączymy te dwa logowania w jedno.</p>
<p style="margin:0 0 16px">Po potwierdzeniu będziesz mógł się logować zarówno hasłem, jak i przez {1} — zawsze do tego samego konta.</p>
<div style="text-align:center;margin:28px 0">
<a href="{2}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Połącz konta</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:13px">Link wygasa za <strong>{3}</strong>.</p>
<p style="margin:16px 0 0;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px">To nie Ty? Zignoruj tę wiadomość — bez kliknięcia konta pozostają niezależne.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:20px 24px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">© MyPerformance · automatyczna wiadomość</td></tr>
</table>
</div></body></html>`,
  },
};

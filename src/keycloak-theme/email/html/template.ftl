<#--
  MyPerformance branded email layout (1:1 z DEFAULT_LAYOUT_HTML
  z lib/email/db/layouts.ts).
  - Czarny header (#0c0c0e), brand jako tekst (Helvetica Neue)
  - Białe karty, szara stopka, czarne CTA
  - Inline CSS only, mobile-friendly (max-width 600)
-->
<#macro emailLayout title="" preheader="">
<!DOCTYPE html>
<html lang="${(locale.language)!"pl"}" dir="${(ltr!true)?then('ltr','rtl')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title!"MyPerformance"}</title>
<style>
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #f4f4f5;
    color: #333333;
    -webkit-font-smoothing: antialiased;
  }
  table { border-spacing: 0; border-collapse: collapse; }
  .email-wrapper { width: 100%; background-color: #f4f4f5; padding: 40px 20px; }
  .email-container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  .header {
    background-color: #0c0c0e;
    padding: 35px 20px;
    text-align: center;
  }
  .logo {
    color: #ffffff;
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.5px;
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  .content {
    padding: 40px 30px;
    line-height: 1.6;
    font-size: 16px;
    color: #444444;
  }
  .content h1 {
    font-size: 24px;
    color: #111111;
    margin-top: 0;
    margin-bottom: 20px;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.3px;
  }
  .content p { margin-top: 0; margin-bottom: 20px; color: #444444; }
  .content a { color: #0c0c0e; }
  .content strong { color: #111111; }
  .content ul { margin-top: 0; margin-bottom: 20px; padding-left: 20px; color: #444444; }
  .content li { margin: 4px 0; }
  .button-container { text-align: center; margin: 35px 0 15px 0; }
  .button {
    display: inline-block;
    padding: 14px 28px;
    background-color: #0c0c0e;
    color: #ffffff !important;
    text-decoration: none;
    border-radius: 6px;
    font-weight: bold;
    font-size: 16px;
  }
  .info-note {
    background-color: #fafafa;
    border: 1px solid #eeeeee;
    border-radius: 6px;
    padding: 14px 18px;
    color: #444444;
    font-size: 14px;
    line-height: 1.5;
    margin: 20px 0;
  }
  .footer {
    background-color: #fafafa;
    padding: 30px 40px;
    text-align: center;
    font-size: 14px;
    color: #666666;
    border-top: 1px solid #eeeeee;
    line-height: 1.5;
  }
  .footer p { margin: 0 0 5px 0; }
  .footer a {
    color: #0c0c0e;
    text-decoration: none;
    font-weight: bold;
  }
  .footer a:hover { text-decoration: underline; }
  .preheader { display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #f4f4f5; opacity: 0; }
  @media screen and (max-width: 600px) {
    .email-wrapper { padding: 20px 10px !important; }
    .content { padding: 30px 20px !important; }
    .footer { padding: 25px 20px !important; }
    .header { padding: 28px 16px !important; }
    .logo { font-size: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333333;-webkit-font-smoothing:antialiased;">
<#if preheader?? && (preheader?length > 0)>
<div class="preheader" style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f4f5;opacity:0;">${preheader}</div>
</#if>
<div class="email-wrapper" style="width:100%;background-color:#f4f4f5;padding:40px 20px;">
  <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="max-width:600px;width:100%;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <tr>
      <td class="header" style="background-color:#0c0c0e;padding:35px 20px;text-align:center;">
        <p class="logo" style="color:#ffffff;font-size:32px;font-weight:800;letter-spacing:-0.5px;margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">MyPerformance</p>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:40px 30px;line-height:1.6;font-size:16px;color:#444444;">
        <#nested>
      </td>
    </tr>
    <tr>
      <td class="footer" style="background-color:#fafafa;padding:30px 40px;text-align:center;font-size:14px;color:#666666;border-top:1px solid #eeeeee;line-height:1.5;">
        <p style="margin:0 0 5px 0;color:#666666;">Chcesz się z nami skontaktować?</p>
        <p style="margin:0;color:#666666;">Napisz na adres: <a href="mailto:support@myperformance.pl" style="color:#0c0c0e;text-decoration:none;font-weight:bold;">support@myperformance.pl</a></p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>
</#macro>

<#--
  CTA button macro — czarny przycisk dopasowany do app maili.
  URL renderowany TYLKO wewnątrz <a href> (plus fallback link poniżej).
-->
<#macro ctaButton url label>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:35px 0 15px 0;">
  <tr>
    <td align="center" class="button-container" style="text-align:center;">
      <a href="${url!""}" target="_blank" rel="noopener" class="button"
         style="display:inline-block;padding:14px 28px;background-color:#0c0c0e;color:#ffffff !important;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">
        ${label!""}
      </a>
    </td>
  </tr>
</table>
<p style="margin:8px 0 0 0;color:#888888;font-size:12px;line-height:1.5;text-align:center;word-break:break-all;">
  Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:<br>
  <span style="color:#0c0c0e;">${url!""}</span>
</p>
</#macro>

<#--
  Info box used for "link expires in X" notice — visually de-emphasised.
-->
<#macro infoNote text>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
  <tr>
    <td style="background-color:#fafafa;border:1px solid #eeeeee;border-radius:6px;padding:14px 18px;color:#444444;font-size:14px;line-height:1.5;">
      ${text!""}
    </td>
  </tr>
</table>
</#macro>

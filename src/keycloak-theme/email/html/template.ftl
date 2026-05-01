<#--
  MyPerformance branded email layout.
  Uses inline CSS only (no external CSS / fonts / CDN).
  Mobile-friendly (max-width 600).
-->
<#macro emailLayout title="" preheader="">
<!DOCTYPE html>
<html lang="${locale.language!"pl"}" dir="${(ltr!true)?then('ltr','rtl')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title!"MyPerformance"}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
<#if preheader?? && preheader?length gt 0>
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f6fa;opacity:0;">${preheader}</div>
</#if>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f6fa;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <!-- Brand header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1 0%,#14b8a6 100%);padding:32px 40px;text-align:left;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.18);text-align:center;line-height:40px;color:#ffffff;font-weight:700;font-size:18px;letter-spacing:-0.5px;">MP</div>
                </td>
                <td style="vertical-align:middle;padding-left:14px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px;">
                  MyPerformance
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 8px 40px;">
            <#nested>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:8px 40px 32px 40px;border-top:1px solid #e2e8f0;margin-top:24px;">
            <p style="margin:24px 0 8px 0;color:#475569;font-size:13px;line-height:1.5;">
              Wiadomość wysłana automatycznie z systemu MyPerformance. Prosimy nie odpowiadać na ten adres.
            </p>
            <p style="margin:0;color:#475569;font-size:13px;line-height:1.5;">
              Potrzebujesz pomocy? Napisz na <a href="mailto:support@myperformance.pl" style="color:#6366f1;text-decoration:none;">support@myperformance.pl</a>.
            </p>
            <p style="margin:16px 0 0 0;color:#94a3b8;font-size:12px;line-height:1.4;">
              &copy; MyPerformance &middot; auth.myperformance.pl
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
</#macro>

<#--
  CTA button macro. Renders a large, centered, accessible button with the
  full action URL inside <a href>. The URL is NEVER printed inline next to
  body text – only inside the button (and as a plain-text fallback below).
-->
<#macro ctaButton url label>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <a href="${url}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#14b8a6 100%);color:#ffffff !important;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:-0.1px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 12px rgba(99,102,241,0.32);">
        ${label}
      </a>
    </td>
  </tr>
</table>
<p style="margin:8px 0 0 0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center;word-break:break-all;">
  Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:<br>
  <span style="color:#6366f1;">${url}</span>
</p>
</#macro>

<#--
  Info box used for "link expires in X" notice — visually de-emphasised.
-->
<#macro infoNote text>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0;">
  <tr>
    <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;color:#475569;font-size:13px;line-height:1.5;">
      ${text}
    </td>
  </tr>
</table>
</#macro>

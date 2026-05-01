<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailUpdateConfirmationSubject") preheader=msg("emailUpdatePreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpEmailUpdateHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpEmailUpdateLead", realmName, newEmail)}
  </p>
  <@layout.ctaButton url=link label=msg("mpCtaEmailUpdate") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", linkExpirationFormatter(linkExpiration)) />
  <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
    ${msg("mpEmailUpdateIgnore")}
  </p>
</@layout.emailLayout>

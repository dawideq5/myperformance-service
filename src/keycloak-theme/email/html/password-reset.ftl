<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("passwordResetSubject") preheader=msg("passwordResetPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpPasswordResetHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpPasswordResetLead", realmName)}
  </p>
  <@layout.ctaButton url=link label=msg("mpCtaPasswordReset") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", linkExpirationFormatter(linkExpiration)) />
  <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
    ${msg("mpPasswordResetIgnore")}
  </p>
</@layout.emailLayout>

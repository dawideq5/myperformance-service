<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("passwordResetSubject") preheader=msg("passwordResetPreheader")>
  <h1>${msg("mpPasswordResetHeading")}</h1>
  <p>${msg("mpPasswordResetLead", (realmName)!"")}</p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaPasswordReset") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpPasswordResetIgnore")}</p>
</@layout.emailLayout>

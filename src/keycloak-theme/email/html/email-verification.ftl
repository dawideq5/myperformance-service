<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailVerificationSubject") preheader=msg("emailVerificationPreheader")>
  <h1>${msg("mpEmailVerificationHeading")}</h1>
  <p>${msg("mpEmailVerificationLead", (realmName)!"")}</p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaEmailVerification") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpEmailVerificationIgnore")}</p>
</@layout.emailLayout>

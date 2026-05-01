<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailUpdateConfirmationSubject") preheader=msg("emailUpdatePreheader")>
  <h1>${msg("mpEmailUpdateHeading")}</h1>
  <p>${msg("mpEmailUpdateLead", (realmName)!"", (newEmail)!"")}</p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaEmailUpdate") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpEmailUpdateIgnore")}</p>
</@layout.emailLayout>

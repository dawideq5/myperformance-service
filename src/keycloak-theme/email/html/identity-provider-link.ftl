<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("identityProviderLinkSubject", (identityProviderAlias)!"") preheader=msg("idpLinkPreheader")>
  <h1>${msg("mpIdpLinkHeading")}</h1>
  <p>${msg("mpIdpLinkLead", (identityProviderAlias)!"", (identityProviderContext.username)!"", (identityProviderDisplayName)!"")}</p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaIdpLink") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpIdpLinkIgnore", (identityProviderAlias)!"", (identityProviderDisplayName)!"")}</p>
</@layout.emailLayout>

<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("identityProviderLinkSubject", identityProviderAlias) preheader=msg("idpLinkPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpIdpLinkHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpIdpLinkLead", identityProviderAlias, identityProviderContext.username, identityProviderDisplayName)}
  </p>
  <@layout.ctaButton url=link label=msg("mpCtaIdpLink") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", linkExpirationFormatter(linkExpiration)) />
  <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
    ${msg("mpIdpLinkIgnore", identityProviderAlias, identityProviderDisplayName)}
  </p>
</@layout.emailLayout>

<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("orgInviteSubject", (organization.name)!"") preheader=msg("mpOrgInvitePreheader")>
  <h1>${msg("mpOrgInviteHeading")}</h1>
  <p>
    <#if firstName?? && lastName??>
      ${msg("mpOrgInviteLeadPersonalized", firstName, lastName, (organization.name)!"")}
    <#else>
      ${msg("mpOrgInviteLead", (organization.name)!"")}
    </#if>
  </p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaOrgInvite") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpOrgInviteIgnore")}</p>
</@layout.emailLayout>

<#ftl output_format="plainText">
${msg("mpOrgInviteHeading")}

<#if firstName?? && lastName??>
${msg("mpOrgInviteLeadPersonalized", firstName, lastName, (organization.name)!"")}
<#else>
${msg("mpOrgInviteLead", (organization.name)!"")}
</#if>

${(link)!""}

${msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"")}

${msg("mpOrgInviteIgnore")}

—
MyPerformance · support@myperformance.pl

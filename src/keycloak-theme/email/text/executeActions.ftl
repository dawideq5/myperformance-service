<#ftl output_format="plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#items></#list><#else></#if></#assign>
${msg("mpExecuteActionsHeading")}

${msg("mpExecuteActionsLead", realmName)}

- ${requiredActionsText}

${msg("mpExecuteActionsCallToAction")}

${link}

${msg("mpLinkExpiryNotice", linkExpirationFormatter(linkExpiration))}

${msg("mpExecuteActionsIgnore")}

—
MyPerformance · support@myperformance.pl

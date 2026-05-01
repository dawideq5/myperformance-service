<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("executeActionsSubject") preheader=msg("executeActionsPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpExecuteActionsHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpExecuteActionsLead", realmName)}
  </p>
  <ul style="margin:0 0 16px 18px;padding:0;color:#0f172a;font-size:15px;line-height:1.7;">
    <#if requiredActions??>
      <#list requiredActions as reqActionItem>
        <li>${msg("requiredAction.${reqActionItem}")}</li>
      </#list>
    </#if>
  </ul>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpExecuteActionsCallToAction")}
  </p>
  <@layout.ctaButton url=link label=msg("mpCtaExecuteActions") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", linkExpirationFormatter(linkExpiration)) />
  <p style="margin:16px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
    ${msg("mpExecuteActionsIgnore")}
  </p>
</@layout.emailLayout>

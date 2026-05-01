<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("executeActionsSubject") preheader=msg("executeActionsPreheader")>
  <h1>${msg("mpExecuteActionsHeading")}</h1>
  <p>${msg("mpExecuteActionsLead", (realmName)!"")}</p>
  <ul>
    <#if requiredActions??>
      <#list requiredActions as reqActionItem>
        <li>${msg("requiredAction.${reqActionItem}")}</li>
      </#list>
    </#if>
  </ul>
  <p>${msg("mpExecuteActionsCallToAction")}</p>
  <@layout.ctaButton url=(link)!"" label=msg("mpCtaExecuteActions") />
  <@layout.infoNote text=msg("mpLinkExpiryNotice", (linkExpirationFormatter(linkExpiration))!"") />
  <p style="color:#666666;font-size:14px;">${msg("mpExecuteActionsIgnore")}</p>
</@layout.emailLayout>

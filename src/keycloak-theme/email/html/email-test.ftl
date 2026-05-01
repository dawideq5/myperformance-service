<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailTestSubject") preheader=msg("mpEmailTestPreheader")>
  <h1>${msg("mpEmailTestHeading")}</h1>
  <p>${msg("mpEmailTestLead")}</p>
  <@layout.infoNote text=msg("mpEmailTestNotice") />
</@layout.emailLayout>

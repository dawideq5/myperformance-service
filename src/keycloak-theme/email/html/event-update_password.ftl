<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUpdatePasswordSubject") preheader=msg("mpEventUpdatePasswordPreheader")>
  <h1>${msg("mpEventUpdatePasswordHeading")}</h1>
  <p>${msg("mpEventUpdatePasswordLead", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

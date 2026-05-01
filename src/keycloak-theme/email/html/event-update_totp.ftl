<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUpdateTotpSubject") preheader=msg("mpEventUpdateTotpPreheader")>
  <h1>${msg("mpEventUpdateTotpHeading")}</h1>
  <p>${msg("mpEventUpdateTotpLead", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

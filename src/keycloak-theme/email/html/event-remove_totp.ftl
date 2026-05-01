<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventRemoveTotpSubject") preheader=msg("mpEventRemoveTotpPreheader")>
  <h1>${msg("mpEventRemoveTotpHeading")}</h1>
  <p>${msg("mpEventRemoveTotpLead", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

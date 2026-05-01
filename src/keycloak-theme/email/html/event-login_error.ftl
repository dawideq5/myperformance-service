<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventLoginErrorSubject") preheader=msg("mpEventLoginErrorPreheader")>
  <h1>${msg("mpEventLoginErrorHeading")}</h1>
  <p>${msg("mpEventLoginErrorLead", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

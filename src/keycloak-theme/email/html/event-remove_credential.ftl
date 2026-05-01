<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventRemoveCredentialSubject") preheader=msg("mpEventRemoveCredentialPreheader")>
  <h1>${msg("mpEventRemoveCredentialHeading")}</h1>
  <p>${msg("mpEventRemoveCredentialLead", (event.details.credential_type)!"", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

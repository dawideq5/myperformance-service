<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUpdateCredentialSubject") preheader=msg("mpEventUpdateCredentialPreheader")>
  <h1>${msg("mpEventUpdateCredentialHeading")}</h1>
  <p>${msg("mpEventUpdateCredentialLead", (event.details.credential_type)!"", (event.date)!"", (event.ipAddress)!"")}</p>
  <@layout.infoNote text=msg("mpEventNotMeNotice") />
</@layout.emailLayout>

<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUserDisabledByTemporaryLockoutSubject") preheader=msg("mpEventLockoutTemporaryPreheader")>
  <h1>${msg("mpEventLockoutTemporaryHeading")}</h1>
  <p>${msg("mpEventLockoutTemporaryLead", (event.date)!"")}</p>
  <@layout.infoNote text=msg("mpContactAdminNotice") />
</@layout.emailLayout>

<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUserDisabledByPermanentLockoutSubject") preheader=msg("mpEventLockoutPermanentPreheader")>
  <h1>${msg("mpEventLockoutPermanentHeading")}</h1>
  <p>${msg("mpEventLockoutPermanentLead", (event.date)!"")}</p>
  <@layout.infoNote text=msg("mpContactAdminNotice") />
</@layout.emailLayout>

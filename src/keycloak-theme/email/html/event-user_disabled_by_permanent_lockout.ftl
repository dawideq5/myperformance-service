<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUserDisabledByPermanentLockoutSubject") preheader=msg("mpEventLockoutPermanentPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpEventLockoutPermanentHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpEventLockoutPermanentLead", event.date)}
  </p>
  <@layout.infoNote text=msg("mpContactAdminNotice") />
</@layout.emailLayout>

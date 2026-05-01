<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("eventUserDisabledByTemporaryLockoutSubject") preheader=msg("mpEventLockoutTemporaryPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpEventLockoutTemporaryHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpEventLockoutTemporaryLead", event.date)}
  </p>
  <@layout.infoNote text=msg("mpContactAdminNotice") />
</@layout.emailLayout>

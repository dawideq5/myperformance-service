<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailTestSubject") preheader=msg("mpEmailTestPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpEmailTestHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpEmailTestLead")}
  </p>
  <@layout.infoNote text=msg("mpEmailTestNotice") />
</@layout.emailLayout>

<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailVerificationSubject") preheader=msg("emailVerificationPreheader")>
  <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1.3;">
    ${msg("mpEmailVerificationCodeHeading")}
  </h1>
  <p style="margin:0 0 16px 0;color:#0f172a;font-size:15px;line-height:1.6;">
    ${msg("mpEmailVerificationCodeLead")}
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <div style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 28px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#0f172a;">
          ${code}
        </div>
      </td>
    </tr>
  </table>
  <@layout.infoNote text=msg("mpVerificationCodeNotice") />
</@layout.emailLayout>

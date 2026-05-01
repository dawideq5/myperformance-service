<#import "template.ftl" as layout>
<@layout.emailLayout title=msg("emailVerificationSubject") preheader=msg("emailVerificationPreheader")>
  <h1>${msg("mpEmailVerificationCodeHeading")}</h1>
  <p>${msg("mpEmailVerificationCodeLead")}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <div style="display:inline-block;background:#fafafa;border:1px solid #eeeeee;border-radius:6px;padding:18px 28px;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#111111;">
          ${(code)!""}
        </div>
      </td>
    </tr>
  </table>
  <@layout.infoNote text=msg("mpVerificationCodeNotice") />
</@layout.emailLayout>

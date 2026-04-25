import { getMaintenance, getBranding } from "@/lib/email/db";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [m, b] = await Promise.all([
    getMaintenance().catch(() => null),
    getBranding().catch(() => null),
  ]);
  const brandName = b?.brandName ?? "MyPerformance";
  const supportEmail = b?.supportEmail ?? "support@myperformance.pl";

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Tryb konserwacji — {brandName}</title>
        <style>{`
          *{margin:0;padding:0;box-sizing:border-box}
          html,body{height:100%}
          body{
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            background:#f4f4f5;color:#333;
            display:flex;align-items:center;justify-content:center;
          }
          .card{
            max-width:560px;width:90%;
            background:#fff;border-radius:12px;overflow:hidden;
            box-shadow:0 4px 20px rgba(0,0,0,0.08);
          }
          .header{
            background:#0c0c0e;color:#fff;
            padding:40px 32px;text-align:center;
          }
          .header h1{
            font-size:32px;font-weight:800;letter-spacing:-0.5px;
            margin:0;
          }
          .icon{
            font-size:48px;margin-bottom:12px;
          }
          .body{padding:36px 32px;line-height:1.6}
          .body h2{font-size:22px;color:#111;margin-bottom:12px}
          .body p{color:#444;margin-bottom:14px;font-size:15px}
          .message{
            background:#fef3c7;border:1px solid #fde68a;border-radius:8px;
            padding:14px 16px;margin:18px 0;
            color:#92400e;font-size:14px;
          }
          .footer{
            background:#fafafa;padding:18px 32px;
            text-align:center;font-size:13px;color:#666;
            border-top:1px solid #eee;
          }
          .footer a{color:#0c0c0e;text-decoration:none;font-weight:600}
          .footer a:hover{text-decoration:underline}
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="header">
            <div className="icon">🔧</div>
            <h1>{brandName}</h1>
          </div>
          <div className="body">
            <h2>Trwają prace serwisowe</h2>
            <p>
              Pracujemy nad ulepszeniami platformy. Wszystkie aplikacje są
              chwilowo niedostępne dla użytkowników.
            </p>
            {m?.message && <div className="message">{m.message}</div>}
            <p>
              Powrócimy zaraz —{" "}
              {m?.expiresAt
                ? `przewidywany koniec: ${new Date(
                    m.expiresAt,
                  ).toLocaleString("pl-PL")}`
                : "zwykle prace trwają nie dłużej niż kilkadziesiąt minut"}.
            </p>
            <p>
              Trwające zlecenia, dokumenty i wiadomości są bezpieczne — nic
              nie zostanie utracone podczas tej konserwacji.
            </p>
          </div>
          <div className="footer">
            Pytania? Napisz na{" "}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </div>
        </div>
      </body>
    </html>
  );
}

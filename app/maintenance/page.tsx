import { getBranding, getMaintenance } from "@/lib/email/db";
import { MaintenanceCanvas } from "./MaintenanceCanvas";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [b, m] = await Promise.all([
    getBranding().catch(() => null),
    getMaintenance().catch(() => null),
  ]);
  const brandName = b?.brandName ?? "MyPerformance";
  const message = m?.message?.trim() || null;

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <meta name="robots" content="noindex,nofollow" />
        <title>{brandName}</title>
        <style>{`
          *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
          html,body{height:100%}
          body{
            font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;
            background:radial-gradient(ellipse at top, #1a1a1f 0%, #0a0a0c 70%);
            color:#fff;
            display:flex;align-items:center;justify-content:center;
            min-height:100vh;
            position:relative;overflow:hidden;
            -webkit-font-smoothing:antialiased;
          }
          .panel{
            position:relative;z-index:1;
            text-align:center;
            padding:0 24px;
            max-width:540px;
            animation:fadeIn 700ms cubic-bezier(0.2,0.8,0.2,1);
          }
          @keyframes fadeIn{
            from{opacity:0;transform:translateY(6px)}
            to{opacity:1;transform:translateY(0)}
          }
          h1{
            font-size:clamp(28px,4.5vw,44px);font-weight:600;
            letter-spacing:-0.02em;line-height:1.15;
            color:rgba(255,255,255,0.95);
          }
          p.message{
            margin-top:20px;
            font-size:15px;line-height:1.6;
            color:rgba(255,255,255,0.6);
            max-width:420px;
            margin-left:auto;margin-right:auto;
          }
          .actions{
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            z-index:2;
            display:flex;gap:18px;align-items:center;
          }
          .actions a{
            font-size:12px;letter-spacing:0.12em;text-transform:uppercase;
            color:rgba(255,255,255,0.32);
            text-decoration:none;
            transition:color 200ms ease;
            padding:8px 14px;
          }
          .actions a:hover{color:rgba(255,255,255,0.7)}
        `}</style>
      </head>
      <body>
        <MaintenanceCanvas />
        <main className="panel">
          <h1>Wracamy po krótkiej przerwie</h1>
          {message && <p className="message">{message}</p>}
        </main>
        <div className="actions">
          <a href="/api/auth/signout?callbackUrl=%2Flogin" rel="nofollow">
            Wyloguj
          </a>
        </div>
      </body>
    </html>
  );
}

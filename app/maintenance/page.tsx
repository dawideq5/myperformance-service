import { getBranding } from "@/lib/email/db";
import { MaintenanceCanvas } from "./MaintenanceCanvas";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const b = await getBranding().catch(() => null);
  const brandName = b?.brandName ?? "MyPerformance";

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
            animation:fadeIn 700ms cubic-bezier(0.2,0.8,0.2,1);
          }
          @keyframes fadeIn{
            from{opacity:0;transform:translateY(6px)}
            to{opacity:1;transform:translateY(0)}
          }
          h1{
            font-size:clamp(32px,5vw,48px);font-weight:600;
            letter-spacing:-0.02em;line-height:1.1;
            color:rgba(255,255,255,0.95);
          }
          .login-link{
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            z-index:2;
            font-size:12px;letter-spacing:0.12em;text-transform:uppercase;
            color:rgba(255,255,255,0.32);
            text-decoration:none;
            transition:color 200ms ease;
            padding:8px 14px;
          }
          .login-link:hover{color:rgba(255,255,255,0.7)}
        `}</style>
      </head>
      <body>
        <MaintenanceCanvas />
        <main className="panel">
          <h1>Wracamy po przerwie</h1>
        </main>
        <a href="/login" className="login-link" rel="nofollow">
          Zaloguj się →
        </a>
      </body>
    </html>
  );
}

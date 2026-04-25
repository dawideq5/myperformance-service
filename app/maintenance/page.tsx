import { getMaintenance, getBranding } from "@/lib/email/db";
import { MaintenanceCanvas } from "./MaintenanceCanvas";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [m, b] = await Promise.all([
    getMaintenance().catch(() => null),
    getBranding().catch(() => null),
  ]);
  const brandName = b?.brandName ?? "MyPerformance";
  const expiresAt = m?.expiresAt
    ? new Date(m.expiresAt).toLocaleString("pl-PL", {
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <meta name="robots" content="noindex,nofollow" />
        <title>Trwają prace serwisowe — {brandName}</title>
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
            max-width:520px;
            animation:fadeIn 600ms ease-out;
          }
          @keyframes fadeIn{
            from{opacity:0;transform:translateY(8px)}
            to{opacity:1;transform:translateY(0)}
          }
          .brand{
            font-size:13px;letter-spacing:0.18em;text-transform:uppercase;
            color:rgba(255,255,255,0.55);
            margin-bottom:32px;font-weight:500;
          }
          h1{
            font-size:clamp(28px,4vw,40px);font-weight:700;
            letter-spacing:-0.02em;line-height:1.15;
            margin-bottom:18px;
          }
          p.lead{
            font-size:16px;line-height:1.65;
            color:rgba(255,255,255,0.72);
            max-width:440px;margin:0 auto 28px;
          }
          .meta{
            display:inline-flex;align-items:center;gap:10px;
            padding:10px 18px;
            background:rgba(255,255,255,0.04);
            border:1px solid rgba(255,255,255,0.08);
            border-radius:999px;
            font-size:13px;color:rgba(255,255,255,0.7);
            margin-top:8px;
            backdrop-filter:blur(10px);
          }
          .dot{
            width:7px;height:7px;border-radius:50%;
            background:#f59e0b;
            box-shadow:0 0 10px rgba(245,158,11,0.7);
            animation:pulse 1.8s infinite ease-in-out;
          }
          @keyframes pulse{
            0%,100%{opacity:1;transform:scale(1)}
            50%{opacity:0.55;transform:scale(0.85)}
          }
        `}</style>
      </head>
      <body>
        <MaintenanceCanvas />
        <main className="panel">
          <div className="brand">{brandName}</div>
          <h1>Wracamy za chwilę</h1>
          <p className="lead">
            {m?.message?.trim()
              ? m.message
              : "Aktualizujemy platformę. Twoje dane są bezpieczne — żadne zlecenie ani dokument nie zostaną utracone."}
          </p>
          {expiresAt && (
            <div className="meta">
              <span className="dot" aria-hidden="true" />
              do {expiresAt}
            </div>
          )}
        </main>
      </body>
    </html>
  );
}

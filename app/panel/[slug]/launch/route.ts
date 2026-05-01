export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { canAccessPanel } from "@/lib/admin-auth";
import { listCertificates } from "@/lib/persistence";

interface Ctx {
  params: Promise<{ slug: string }>;
}

const PANEL_DOMAINS: Record<string, { domain: string; label: string; devPort: number }> = {
  sprzedawca: {
    domain: "panelsprzedawcy.myperformance.pl",
    label: "Panel Sprzedawcy",
    devPort: 3001,
  },
  serwisant: {
    domain: "panelserwisanta.myperformance.pl",
    label: "Panel Serwisanta",
    devPort: 3002,
  },
  kierowca: {
    domain: "panelkierowcy.myperformance.pl",
    label: "Panel Kierowcy",
    devPort: 3003,
  },
};

const isDevBypass =
  process.env.NODE_ENV === "development" &&
  process.env.DEV_CERT_BYPASS === "true";

/**
 * Preflight launcher dla paneli mTLS. User klika tile na dashboardzie →
 * najpierw trafia tutaj zamiast bezpośrednio na panelX.myperformance.pl.
 *
 * Sprawdza:
 *   1. Czy user jest zalogowany (session)
 *   2. Czy ma rolę panel-X (KC realm role)
 *   3. Czy ma aktywny (nie wygasły, nie odwołany) certyfikat klienta mTLS
 *
 * Jeśli wszystko OK → 302 redirect na panelX.myperformance.pl (browser
 * pyta o cert, user wybiera, panel się otwiera).
 *
 * Jeśli brak certu → 200 z friendly HTML page: "Pobierz certyfikat" CTA do
 * /account?tab=certificates. Bez tego user lądowałby bezpośrednio na panelu,
 * dostawałby cert prompt, anulował, dostawał loop bez context.
 */
function renderNoCertPage(panel: { domain: string; label: string }, email?: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${panel.label} — wymagany certyfikat</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0c0e;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{max-width:520px;width:100%;background:#18181b;border:1px solid #2a2a2e;border-radius:16px;padding:40px}
    h1{font-size:22px;font-weight:600;margin-bottom:12px}
    p{color:#a1a1aa;line-height:1.6;margin-bottom:16px;font-size:14px}
    .icon{width:48px;height:48px;background:#fbbf24/10;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;color:#fbbf24;font-size:28px}
    .actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
    a.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500}
    a.primary{background:#3b82f6;color:#fff}
    a.primary:hover{background:#2563eb}
    a.secondary{background:#2a2a2e;color:#fff;border:1px solid #3a3a3e}
    a.secondary:hover{background:#3a3a3e}
    .domain{font-family:'SF Mono',Monaco,monospace;font-size:12px;color:#71717a;margin-top:8px}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h1>${panel.label} wymaga certyfikatu</h1>
    <p>Aby wejść na ${panel.label.toLowerCase()}, potrzebujesz osobistego certyfikatu klienta (mTLS). Zabezpiecza on dostęp i wiąże Twoje konto z konkretnym urządzeniem.</p>
    <p>${email ? `Konto <strong>${email}</strong> nie ma jeszcze aktywnego certyfikatu.` : ""} Wygeneruj go w panelu certyfikatów — to zajmie kilka sekund.</p>
    <div class="actions">
      <a class="btn primary" href="/account?tab=certificates">Pobierz certyfikat</a>
      <a class="btn secondary" href="/dashboard">← Wróć do dashboardu</a>
    </div>
    <div class="domain">Cel: ${panel.domain}</div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const panel = PANEL_DOMAINS[slug];
  if (!panel) {
    return NextResponse.json({ error: "Unknown panel" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://myperformance.pl";
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=/panel/${slug}/launch`, appUrl),
    );
  }

  // Permission check: user musi mieć rolę panel-{slug} albo być superadminem.
  if (!canAccessPanel(session, slug as "sprzedawca" | "serwisant" | "kierowca")) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Brak dostępu</h2><p>Nie masz uprawnień do ${panel.label}. Skontaktuj się z administratorem.</p><a href="/dashboard">← Dashboard</a></body></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // DEV bypass — skip cert check i przekieruj na lokalny port panelu.
  if (isDevBypass) {
    return NextResponse.redirect(`http://localhost:${panel.devPort}/`);
  }

  // Cert check: szukamy active cert dla email usera.
  const userEmail = session.user.email.toLowerCase();
  let hasActiveCert = false;
  try {
    const certs = await listCertificates();
    const now = Date.now();
    hasActiveCert = certs.some((c) => {
      if (c.email?.toLowerCase() !== userEmail) return false;
      if (c.revokedAt) return false;
      if (c.notAfter && new Date(c.notAfter).getTime() < now) return false;
      // Czy cert obejmuje ten panel? (roles: sprzedawca/serwisant/kierowca)
      const roles = c.roles ?? (c.role ? [c.role] : []);
      return roles.includes(slug);
    });
  } catch (err) {
    console.warn("[panel launch] cert lookup failed:", err);
    // Fail-soft: gdy DB padnie, nie blokujemy usera, redirect do panelu.
    hasActiveCert = true;
  }

  if (!hasActiveCert) {
    return renderNoCertPage(panel, session.user.email);
  }

  return NextResponse.redirect(`https://${panel.domain}/`);
}

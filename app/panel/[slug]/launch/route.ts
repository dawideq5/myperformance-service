export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { canAccessPanel } from "@/lib/admin-auth";

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

  // Traefik wymusza mTLS na docelowej domenie (RequireAndVerifyClientCert).
  return NextResponse.redirect(`https://${panel.domain}/`);
}

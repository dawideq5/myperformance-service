export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { getServiceAnnex } from "@/lib/service-annexes";

/**
 * Wave 20 / Faza 1A — endpoint "drukuj aneks".
 *
 * Zwraca prosty HTML z embedded iframe na PDF (`/annexes/[id]/pdf`) i
 * skryptem auto-`window.print()` po załadowaniu PDF. Otwarte w nowej
 * karcie z poziomu panelu serwisanta — dialog drukowania pojawia się
 * od razu bez potrzeby ręcznego klikania w viewerze przeglądarki.
 *
 * Auth: identyczny gate jak `/pdf` (panel JWT + locationIds owner check).
 * Sam endpoint nie zwraca content z PDF — iframe pobiera go przez relay.
 */

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; annexId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, annexId } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }
  const annex = await getServiceAnnex(annexId);
  if (!annex || annex.serviceId !== id) {
    return NextResponse.json(
      { error: "Annex not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }

  const ticket = service.ticketNumber ?? id;
  const pdfRelayUrl = `/api/relay/services/${encodeURIComponent(id)}/annexes/${encodeURIComponent(annexId)}/pdf`;
  // Ważne: iframe src wskazuje na panel-side relay (`/api/relay/...`)
  // a nie bezpośrednio dashboard endpoint, bo nasza panel-strona
  // wymaga panel-side cookies (NextAuth). Endpoint print/PDF żyje pod
  // tą samą domeną co panel.
  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<title>Drukuj aneks ${escapeHtml(ticket)}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #1a1a1a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { display: flex; flex-direction: column; height: 100vh; }
  .toolbar { padding: 12px 16px; background: #0c0c0e; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .toolbar h1 { margin: 0; font-size: 14px; font-weight: 600; }
  .toolbar button { background: #fff; color: #0c0c0e; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .toolbar button:hover { background: #f0f0f0; }
  .frame { flex: 1; border: none; width: 100%; }
  @media print {
    .toolbar { display: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="toolbar">
    <h1>Drukowanie aneksu ${escapeHtml(ticket)}</h1>
    <button type="button" onclick="window.print()">Drukuj</button>
  </div>
  <iframe id="pdf" class="frame" src="${escapeHtml(pdfRelayUrl)}" title="Aneks PDF"></iframe>
</div>
<script>
  (function() {
    var iframe = document.getElementById('pdf');
    var triggered = false;
    function triggerPrint() {
      if (triggered) return;
      triggered = true;
      // Krótki delay żeby PDF zdążył się wyrenderować w viewerze.
      setTimeout(function() {
        try {
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } else {
            window.print();
          }
        } catch (e) {
          // Cross-origin może blokować focus/print — fallback na window.print
          window.print();
        }
      }, 600);
    }
    iframe.addEventListener('load', triggerPrint);
    // Fallback na wypadek gdyby load event nie przyszedł (Safari/PDF embed).
    setTimeout(triggerPrint, 2500);
  })();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      ...PANEL_CORS_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

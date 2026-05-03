import { IntakePreviewClient } from "./IntakePreviewClient";

export const dynamic = "force-dynamic";

/**
 * /chatwoot-app/intake-preview?service_id=...
 *
 * Wave 23 — Chatwoot Dashboard App. Embedded jako iframe w Chatwoot
 * conversation sidebar (per-inbox configuration). Agent obsługujący
 * conversation widzi LIVE preview formularza intake który sprzedawca
 * aktualnie wypełnia.
 *
 * Konfiguracja w Chatwoot:
 *   Settings → Integrations → Dashboard Apps
 *   URL: https://myperformance.pl/chatwoot-app/intake-preview?service_id={{conversation.custom_attributes.service_id}}
 *   Service ID musi być zapisany jako custom attribute na conversation
 *   przez sprzedawcę (lub auto przez backend gdy sprzedawca submituje
 *   intake form i tworzy ticket — wtedy POST /api/livekit/start-publisher
 *   wstrzykuje też conversation custom attributes).
 *
 * Strona jest publiczna (frame-ancestors header w next.config.js
 * zezwala chat.myperformance.pl). Polling co 4 s przez
 * /api/livekit/intake-snapshot — sanitized data, żadnych lock_code.
 */
export default async function IntakePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ service_id?: string }>;
}) {
  const sp = await searchParams;
  const serviceId = sp.service_id?.trim() ?? "";
  return <IntakePreviewClient serviceId={serviceId} />;
}

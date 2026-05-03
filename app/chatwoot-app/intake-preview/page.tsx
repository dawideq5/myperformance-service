import { IntakePreviewClient } from "./IntakePreviewClient";

export const dynamic = "force-dynamic";

/**
 * /chatwoot-app/intake-preview?conversation_id=...&service_id=...
 *
 * Chatwoot Dashboard App embedded jako iframe w sidebarze konwersacji.
 * Klient (Dashboard App przekazuje `{{conversation.id}}` automatycznie —
 * jest to canonical key) widzi LIVE preview formularza intake.
 *
 * Wave 23 (legacy): URL miał `?service_id={{conversation.custom_attributes.service_id}}`,
 * co wymagało żeby ticket był już utworzony i custom attribute ustawione.
 * Wave 24: preferowane jest `?conversation_id={{conversation.id}}` — działa
 * od razu po pierwszej wiadomości w rozmowie, jeszcze przed zapisem zlecenia.
 * Backend snapshot endpoint sam decyduje czy serwować draft state z
 * `mp_intake_drafts` czy live `mp_services` (po bind'zie).
 *
 * Strona jest publiczna (frame-ancestors header w next.config.js zezwala
 * chat.myperformance.pl).
 */
export default async function IntakePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ service_id?: string; conversation_id?: string }>;
}) {
  const sp = await searchParams;
  const rawServiceId = sp.service_id?.trim() ?? "";
  const rawConvId = sp.conversation_id?.trim() ?? "";
  // Chatwoot template literals nie są evaluowane gdy custom attribute brakuje —
  // dostajemy literalnie `"{{conversation.custom_attributes.service_id}}"`. Filtrujemy.
  const serviceId =
    rawServiceId && !rawServiceId.includes("{{") ? rawServiceId : "";
  const conversationId =
    /^\d+$/.test(rawConvId) && Number(rawConvId) > 0
      ? Number(rawConvId)
      : null;

  return (
    <IntakePreviewClient
      serviceId={serviceId}
      conversationId={conversationId}
    />
  );
}

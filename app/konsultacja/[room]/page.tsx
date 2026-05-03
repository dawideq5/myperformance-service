import { ConsultationViewer } from "./ConsultationViewer";

export const dynamic = "force-dynamic";

/**
 * /konsultacja/[room]?token=<signed-jwt>
 *
 * Wave 23 — public endpoint dla agenta Chatwoot. Klika w link wstrzyknięty
 * do conversation message, otwiera tę stronę. Page server-renderuje shell;
 * <ConsultationViewer /> client-side waliduje token przez
 * GET /api/livekit/join-token i podłącza się jako subscriber.
 *
 * Brak guard'a w middleware (matcher nie obejmuje /konsultacja/*) — auth
 * jest w samym URL'u (signed JWT).
 */
export default async function KonsultacjaPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { room } = await params;
  const sp = await searchParams;
  const token = sp.token ?? "";

  return <ConsultationViewer roomName={decodeURIComponent(room)} token={token} />;
}

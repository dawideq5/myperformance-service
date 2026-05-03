import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LiveServicePreview } from "@/components/features/LiveServicePreview";

/**
 * Live service preview route (Wave 22 / F15).
 *
 * URL: `/podglad/<serviceId>` — read-only widok zlecenia z real-time updates
 * od sprzedawcy (SSE channel `service:<id>`). Otwierane głównie z linku w
 * Chatwoot conversation (custom attribute `service_id` ustawione przez F14)
 * lub deep-linkiem.
 *
 * Auth: panel-serwisant role (lub admin) + SSO session. mTLS enforced przez
 * Traefik na poziomie domeny (PROD), DEV_CERT_BYPASS w dev.
 */
export default async function PodgladPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_CERT_BYPASS === "true";
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("serwisant") || roles.includes("admin");
  if (!devBypass && !hasRole) redirect("/forbidden");

  const { id } = await params;
  // UUID validation — żeby nie pchać dowolnego stringa do EventSource.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/");
  }

  return (
    <main
      className="min-h-screen px-4 py-6 max-w-3xl mx-auto"
      style={{ background: "var(--bg-base)" }}
    >
      <h1
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Podgląd zlecenia na żywo
      </h1>
      <LiveServicePreview serviceId={id} />
    </main>
  );
}

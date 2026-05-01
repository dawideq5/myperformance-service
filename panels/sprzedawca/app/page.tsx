import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PanelHome } from "@/components/PanelHome";
import type { PanelLocation } from "@/components/PanelLocationMap";
import { extractCertSerial } from "@/lib/device-fingerprint";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

async function fetchLocationsForUser(
  accessToken: string,
  certSerial: string | null,
): Promise<PanelLocation[]> {
  try {
    const qs = new URLSearchParams({ type: "sales" });
    if (certSerial) qs.set("cert_serial", certSerial);
    const res = await fetch(
      `${DASHBOARD_URL}/api/panel/locations?${qs.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { locations?: PanelLocation[] };
    return data.locations ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_CERT_BYPASS === "true";
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("sprzedawca") || roles.includes("admin");
  if (!devBypass && !hasRole) redirect("/forbidden");

  const accessToken =
    (session as { accessToken?: string }).accessToken ?? "";
  // Punkty są przypisane do CERTYFIKATU; identyfikujemy go przez serial z mTLS
  // forwardowany przez Traefik. Brak serial → fallback na email (DEV bypass).
  const hdrs = await headers();
  const certSerial = extractCertSerial(hdrs);
  const locations = accessToken
    ? await fetchLocationsForUser(accessToken, certSerial)
    : [];

  const userLabel = session.user?.name ?? session.user?.email ?? "";
  const userEmail = session.user?.email ?? "";

  return (
    <PanelHome
      locations={locations}
      userLabel={userLabel}
      userEmail={userEmail}
    />
  );
}

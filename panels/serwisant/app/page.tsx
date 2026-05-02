import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PanelHome } from "@/components/PanelHome";
import type { PanelLocation } from "@/components/PanelLocationMap";

const DASHBOARD_URL =
  process.env.DASHBOARD_URL?.trim().replace(/\/$/, "") ??
  "https://myperformance.pl";

async function fetchLocationsForUser(accessToken: string): Promise<PanelLocation[]> {
  try {
    const res = await fetch(
      `${DASHBOARD_URL}/api/panel/locations?type=service`,
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
  const hasRole = roles.includes("serwisant") || roles.includes("admin");
  if (!devBypass && !hasRole) redirect("/forbidden");

  const accessToken =
    (session as { accessToken?: string }).accessToken ?? "";
  const locations = accessToken
    ? await fetchLocationsForUser(accessToken)
    : [];

  const userLabel = session.user?.name ?? session.user?.email ?? "";
  const userEmail = session.user?.email ?? "";

  return (
    <PanelHome
      locations={locations}
      userLabel={userLabel}
      userEmail={userEmail}
      userRoles={roles}
    />
  );
}

import { keycloak } from "@/lib/keycloak";
import { getActiveLocationsForUser } from "@/lib/certificate-locations";
import { log } from "@/lib/logger";

const logger = log.child({ module: "panel-auth" });

export interface PanelUser {
  email: string;
  locationIds: string[];
  /** Email z KC userinfo — używany jako "received_by" / "assigned_*" w rekordach. */
  preferred_username?: string | null;
  name?: string | null;
}

/**
 * Wspólny pre-handler dla cross-origin endpointów panelowych. Waliduje
 * Bearer token przez KC userinfo i zwraca usera + listę location_id do
 * których ma dostęp przez certyfikat klienta. Endpointy serwisowe filtrują
 * dane tym `locationIds` żeby user nie zobaczył cudzych zleceń.
 *
 * Returns null gdy token brak / invalid / no email — caller zwraca 401.
 */
export async function getPanelUserFromRequest(
  req: Request,
): Promise<PanelUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const accessToken = m[1].trim();

  let userinfo: {
    email?: string;
    preferred_username?: string;
    name?: string;
  } | null = null;
  try {
    const issuer = keycloak.getIssuer();
    const r = await fetch(`${issuer}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return null;
    userinfo = await r.json();
  } catch (err) {
    logger.warn("userinfo failed", { err: String(err) });
    return null;
  }

  if (!userinfo?.email) return null;

  const locations = await getActiveLocationsForUser({ email: userinfo.email });
  return {
    email: userinfo.email,
    preferred_username: userinfo.preferred_username ?? null,
    name: userinfo.name ?? null,
    locationIds: locations.map((l) => l.id),
  };
}

export const PANEL_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

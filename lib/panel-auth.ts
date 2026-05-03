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
  /**
   * Wave 22 / F9 — imię i nazwisko z KC profile (claims `given_name` /
   * `family_name`). Czytane z access-token JWT (KC realm wystawia te claims
   * przy `profile` scope) i fallbackowo z userinfo. Używane przez
   * internal-chat endpointy do display w UI zamiast email local-part.
   */
  firstName?: string | null;
  lastName?: string | null;
  /**
   * KC user UUID (claim `sub`) — stable per user identifier. Używane przez
   * mp_user_preferences/notify endpoints żeby panel-side i dashboard-side
   * pisały do tej samej kolumny `user_id`.
   */
  sub: string | null;
  /**
   * Wave 20 — realm roles z KC access tokenu (claim `realm_access.roles`).
   * Używane przez `lib/permissions/roles.ts` do RBAC w detail view.
   * Pusta tablica gdy token nie miał claim (rzadkie — KC realm zawsze
   * dodaje `app_user` przynajmniej).
   */
  realmRoles: string[];
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
    sub?: string;
    email?: string;
    preferred_username?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
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

  const claims = extractProfileClaimsFromToken(accessToken);
  const firstName =
    (userinfo.given_name?.trim() || null) ?? (claims.given_name ?? null);
  const lastName =
    (userinfo.family_name?.trim() || null) ?? (claims.family_name ?? null);

  const locations = await getActiveLocationsForUser({ email: userinfo.email });
  return {
    email: userinfo.email,
    preferred_username: userinfo.preferred_username ?? null,
    name: userinfo.name ?? null,
    firstName,
    lastName,
    sub: userinfo.sub ?? null,
    locationIds: locations.map((l) => l.id),
    realmRoles: extractRealmRolesFromToken(accessToken),
  };
}

/**
 * Wyciąga `realm_access.roles` z claim KC access tokenu (JWT). Bez weryfikacji
 * podpisu — token został właśnie zwalidowany przez userinfo wyżej, więc
 * możemy zaufać payloadowi. Failure → []. Token który nie ma claim też
 * zwraca [] (np. tylko `aud=panel-serwisant`).
 */
function extractRealmRolesFromToken(accessToken: string): string[] {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return [];
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as { realm_access?: { roles?: string[] } };
    const roles = payload?.realm_access?.roles;
    return Array.isArray(roles)
      ? roles.filter((r): r is string => typeof r === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Wave 22 / F9 — imię (given_name) + nazwisko (family_name) z KC access-token
 * JWT. KC realm wystawia te claims przy scope `profile` (default mapper
 * w wszystkich client scopes). Bez weryfikacji podpisu z tego samego powodu
 * co `extractRealmRolesFromToken`. Brak claim → null (caller fallbackuje na
 * userinfo lub email local-part).
 */
function extractProfileClaimsFromToken(
  accessToken: string,
): { given_name: string | null; family_name: string | null } {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return { given_name: null, family_name: null };
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    ) as { given_name?: unknown; family_name?: unknown };
    const given =
      typeof payload?.given_name === "string"
        ? payload.given_name.trim() || null
        : null;
    const family =
      typeof payload?.family_name === "string"
        ? payload.family_name.trim() || null
        : null;
    return { given_name: given, family_name: family };
  } catch {
    return { given_name: null, family_name: null };
  }
}

export const PANEL_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

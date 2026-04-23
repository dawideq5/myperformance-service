import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";

/**
 * Pobiera ŚWIEŻY profil usera z Keycloak admin API. Używany w SSO endpointach,
 * żeby każdy redirect do docelowej aplikacji startował od źródła prawdy — a
 * nie od cached JWT sessioni (która potrafi mieć kilkugodzinny snapshot).
 *
 * Szczególnie ważne dla:
 *   - Chatwoot: `name` z JWT to stary snapshot. Fresh fetch pozwala
 *     zaktualizować Chatwoot userowi imię/nazwisko przy każdym SSO.
 *   - Documenso: to samo — `User.name` aktualizowany z KC SoT.
 *   - Moodle: aktualizacja `firstname`/`lastname` przy launchu kursu.
 */

const logger = log.child({ module: "keycloak-profile" });

export interface FreshKcProfile {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  phone: string | null;
  username: string | null;
  emailVerified: boolean;
  attributes: Record<string, string[]>;
}

interface KcUserRaw {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  emailVerified?: boolean;
  attributes?: Record<string, string[] | undefined>;
}

function pickAttr(attrs: Record<string, string[] | undefined> | undefined, key: string): string | null {
  const v = attrs?.[key]?.[0];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeAttrs(
  raw: Record<string, string[] | undefined> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[k] = v;
  }
  return out;
}

/**
 * @throws jeśli user nie istnieje w KC (nie powinno się zdarzyć dla
 * zalogowanego usera, więc callerzy mogą tu rzucać 500).
 */
export async function getFreshKcProfile(userId: string): Promise<FreshKcProfile> {
  const adminToken = await keycloak.getServiceAccountToken();
  // `userProfileMetadata=true` jest wymagane w KC 26+ żeby attributes zawierały
  // custom fieldy (phoneNumber).
  const res = await keycloak.adminRequest(
    `/users/${userId}?userProfileMetadata=true`,
    adminToken,
  );
  if (!res.ok) {
    throw new Error(`getFreshKcProfile(${userId}) failed: ${res.status}`);
  }
  const raw = (await res.json()) as KcUserRaw;
  const firstName = raw.firstName?.trim() || null;
  const lastName = raw.lastName?.trim() || null;
  const phone =
    pickAttr(raw.attributes, "phoneNumber") ?? pickAttr(raw.attributes, "phone");
  const email = (raw.email ?? "").trim();
  if (!email) {
    logger.warn("KC user has no email", { userId });
  }
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    raw.username ||
    email;
  return {
    userId: raw.id,
    email,
    firstName,
    lastName,
    displayName,
    phone,
    username: raw.username ?? null,
    emailVerified: raw.emailVerified ?? false,
    attributes: normalizeAttrs(raw.attributes),
  };
}

import { keycloak } from "@/lib/keycloak";
import { ApiError } from "@/lib/api-utils";

/**
 * Resolves the service-account admin token + the calling user's Keycloak ID
 * in parallel, then runs fn(adminToken, userId).
 *
 * SECURITY MODEL: `userId` ZAWSZE pochodzi z access tokenu wywołującego usera
 * (nie z body/query). Funkcja jest scoped do **self-service** operations —
 * używać tylko w `/api/account/*` gdzie user operuje na własnych KC zasobach.
 * NIGDY nie używać w endpoints gdzie target user pochodzi z input (np.
 * `/admin/users/[id]/*` — tam użyj `keycloak.getServiceAccountToken()`
 * bezpośrednio + permission checks na poziomie route).
 *
 * Service-account token ma full admin scope w realmie, więc gdyby nieostrożny
 * dev przekazał attacker-controlled targetUserId do callbacka i dał go
 * `keycloak.adminRequest`, byłaby to privilege escalation. Self-scope
 * przekazywany przez ten helper jest jedynym bezpiecznym wzorcem.
 */
export async function withAdminContext<T>(
  accessToken: string,
  fn: (adminToken: string, userId: string) => Promise<T>
): Promise<T> {
  if (!accessToken) {
    throw ApiError.unauthorized("Missing access token");
  }
  const [adminToken, userId] = await Promise.all([
    keycloak.getServiceAccountToken().catch(() => {
      throw ApiError.serviceUnavailable("Keycloak admin service unavailable");
    }),
    keycloak.getUserIdFromToken(accessToken).catch(() => {
      throw ApiError.unauthorized("Unable to resolve user identity");
    }),
  ]);

  if (!userId) {
    throw ApiError.unauthorized("Empty user id from token");
  }

  return fn(adminToken, userId);
}

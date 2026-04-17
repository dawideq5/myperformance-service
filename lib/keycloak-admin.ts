import { keycloak } from "@/lib/keycloak";
import { ApiError } from "@/lib/api-utils";

/**
 * Resolves both the service-account admin token and the calling user's Keycloak ID
 * in parallel, then calls fn(adminToken, userId).
 *
 * Eliminates the repeated boilerplate across API routes:
 *   const userId = await keycloak.getUserIdFromToken(accessToken);
 *   const adminToken = await keycloak.getServiceAccountToken();
 */
export async function withAdminContext<T>(
  accessToken: string,
  fn: (adminToken: string, userId: string) => Promise<T>
): Promise<T> {
  const [adminToken, userId] = await Promise.all([
    keycloak.getServiceAccountToken().catch(() => {
      throw ApiError.serviceUnavailable("Keycloak admin service unavailable");
    }),
    keycloak.getUserIdFromToken(accessToken).catch(() => {
      throw ApiError.unauthorized("Unable to resolve user identity");
    }),
  ]);

  return fn(adminToken, userId);
}

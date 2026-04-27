import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import { notifyUser } from "@/lib/notify";

const logger = log.child({ module: "google-disconnect" });

/**
 * Usuwa federated identity Google z usera + czyści atrybuty `google_*`.
 * Bezpieczne do wywołania automatycznie gdy refresh token Google wygasł
 * (np. user revoke'ował dostęp w Google Account, zmiana hasła Google).
 *
 * Zwraca true gdy disconnect się udał, false gdy nie było co usuwać
 * (federated identity już nie istniała) lub gdy wystąpił błąd.
 */
export async function disconnectGoogleForUser(args: {
  userId: string;
  reason: "manual" | "token_expired" | "revoked";
}): Promise<{ disconnected: boolean; reason: string }> {
  const { userId, reason } = args;
  try {
    const serviceToken = await keycloak.getServiceAccountToken();

    const identitiesResp = await keycloak.adminRequest(
      `/users/${userId}/federated-identity`,
      serviceToken,
    );
    if (!identitiesResp.ok) {
      logger.warn("federated-identity fetch failed", {
        userId,
        status: identitiesResp.status,
      });
      return { disconnected: false, reason: "fetch_failed" };
    }

    const federatedIdentities = (await identitiesResp.json()) as Array<{
      identityProvider?: string;
    }>;
    const hasGoogle = federatedIdentities.some(
      (i) => i.identityProvider === "google",
    );

    if (hasGoogle) {
      const delResp = await keycloak.adminRequest(
        `/users/${userId}/federated-identity/google`,
        serviceToken,
        { method: "DELETE" },
      );
      if (!delResp.ok && delResp.status !== 204) {
        logger.warn("DELETE federated-identity google failed", {
          userId,
          status: delResp.status,
        });
        return { disconnected: false, reason: "delete_failed" };
      }
    }

    // Czyścimy atrybuty Google żeby UI zobaczyło "nie połączone".
    const userResp = await keycloak.adminRequest(
      `/users/${userId}`,
      serviceToken,
    );
    if (userResp.ok) {
      const userData = (await userResp.json()) as {
        attributes?: Record<string, unknown>;
      };
      const attrs = { ...(userData.attributes ?? {}) };
      delete attrs.google_connected;
      delete attrs.google_connected_at;
      delete attrs.google_scopes;
      delete attrs.google_features_requested;
      delete attrs.google_features_requested_at;
      await keycloak.adminRequest(`/users/${userId}`, serviceToken, {
        method: "PUT",
        body: JSON.stringify({ ...userData, attributes: attrs }),
      });
    }

    logger.info("google disconnected", { userId, reason, hadFederated: hasGoogle });

    // Powiadomienie tylko gdy auto-disconnect (nie spamujemy przy manual).
    if (reason !== "manual") {
      await notifyUser(userId, "security.password.changed", {
        title: "Konto Google odłączone automatycznie",
        body:
          reason === "token_expired"
            ? "Twój token dostępu do Google wygasł i nie udało się go odnowić. Konto zostało odłączone — możesz połączyć je ponownie w zakładce Integracje."
            : "Dostęp do Google został cofnięty po stronie Google. Konto zostało odłączone — możesz połączyć je ponownie w zakładce Integracje.",
        severity: "warning",
        payload: { reason, integration: "google" },
      }).catch(() => undefined);
    }

    return { disconnected: hasGoogle, reason };
  } catch (err) {
    logger.error("disconnect failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { disconnected: false, reason: "exception" };
  }
}

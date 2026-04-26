import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import { SUPERADMIN_ROLES } from "@/lib/permissions/superadmin";

const logger = log.child({ module: "mfa-enforcer" });

/**
 * Wymusza MFA dla każdego usera z którąkolwiek superadmin role
 * (realm-admin / manage-realm / admin). Algorytm:
 *
 * 1. Pobierz userów z każdej superadmin role.
 * 2. Dla każdego user-a sprawdź credentials KC: czy ma OTP albo WebAuthn?
 *    - Tak → nic nie rób.
 *    - Nie → dodaj `CONFIGURE_TOTP` do user.requiredActions; user przy
 *      najbliższym loginie MUSI skonfigurować 2FA.
 *
 * Idempotent — bezpieczny do uruchamiania w pętli.
 *
 * Zgodnie z Zero Trust + NIST 800-63B: privileged accounts MUSZĄ mieć MFA.
 */
export async function enforceMfaForAdmins(): Promise<{
  checked: number;
  enforced: number;
  alreadyOk: number;
  errors: number;
}> {
  let checked = 0;
  let enforced = 0;
  let alreadyOk = 0;
  let errors = 0;

  let token: string;
  try {
    token = await keycloak.getServiceAccountToken();
  } catch (err) {
    logger.warn("KC token failed", { err: String(err) });
    return { checked, enforced, alreadyOk, errors: 1 };
  }

  const seen = new Set<string>();

  for (const role of SUPERADMIN_ROLES) {
    try {
      const res = await keycloak.adminRequest(
        `/roles/${encodeURIComponent(role)}/users?max=200`,
        token,
      );
      if (!res.ok) {
        logger.warn("role users fetch failed", { role, status: res.status });
        errors++;
        continue;
      }
      const users = (await res.json()) as Array<{
        id?: string;
        email?: string;
      }>;
      for (const u of users) {
        if (!u.id || seen.has(u.id)) continue;
        seen.add(u.id);
        checked++;

        // Sprawdź czy ma już TOTP albo WebAuthn skonfigurowane
        try {
          const credsRes = await keycloak.adminRequest(
            `/users/${u.id}/credentials`,
            token,
          );
          if (!credsRes.ok) {
            errors++;
            continue;
          }
          const creds = (await credsRes.json()) as Array<{ type?: string }>;
          const hasMfa = creds.some(
            (c) =>
              c.type === "otp" ||
              c.type === "webauthn" ||
              c.type === "webauthn-passwordless",
          );
          if (hasMfa) {
            alreadyOk++;
            continue;
          }

          // Dodaj CONFIGURE_TOTP do requiredActions
          const userRes = await keycloak.adminRequest(`/users/${u.id}`, token);
          if (!userRes.ok) {
            errors++;
            continue;
          }
          const userData = (await userRes.json()) as {
            requiredActions?: string[];
          };
          const actions = new Set(userData.requiredActions ?? []);
          if (actions.has("CONFIGURE_TOTP")) {
            // Już oczekuje konfiguracji — nie duplikujemy
            continue;
          }
          actions.add("CONFIGURE_TOTP");
          const putRes = await keycloak.adminRequest(`/users/${u.id}`, token, {
            method: "PUT",
            body: JSON.stringify({
              ...userData,
              requiredActions: Array.from(actions),
            }),
          });
          if (!putRes.ok) {
            errors++;
            logger.warn("user PUT failed", {
              userId: u.id,
              status: putRes.status,
            });
            continue;
          }
          enforced++;
          logger.info("MFA enforced for admin", {
            userId: u.id,
            email: u.email,
          });
        } catch (err) {
          errors++;
          logger.warn("user check failed", { userId: u.id, err: String(err) });
        }
      }
    } catch (err) {
      errors++;
      logger.warn("role iteration failed", { role, err: String(err) });
    }
  }

  if (enforced > 0 || errors > 0) {
    logger.info("MFA enforcement cycle", {
      checked,
      enforced,
      alreadyOk,
      errors,
    });
  }
  return { checked, enforced, alreadyOk, errors };
}

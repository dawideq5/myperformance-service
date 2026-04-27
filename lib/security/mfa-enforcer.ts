import { keycloak } from "@/lib/keycloak";
import { log } from "@/lib/logger";
import { AREAS } from "@/lib/permissions/areas";
import { SUPERADMIN_ROLES } from "@/lib/permissions/superadmin";

const logger = log.child({ module: "mfa-enforcer" });

/**
 * Wymusza MFA dla wszystkich privileged accounts:
 *   - SUPERADMIN_ROLES (realm-admin / manage-realm / admin)
 *   - role z AREAS gdzie priority >= 90 (area-admins: infrastructure_admin,
 *     keycloak_admin, email_admin, postal_admin, certificates_admin itd.)
 *
 * Algorytm:
 * 1. Skompiluj zbiór privileged ról (SUPERADMIN ∪ area priority>=90).
 * 2. Dla każdej roli pobierz userów (realm role lub client role na
 *    realm-management).
 * 3. Dla każdego user-a sprawdź credentials KC: czy ma OTP albo WebAuthn?
 *    - Tak → nic nie rób.
 *    - Nie → dodaj `CONFIGURE_TOTP` do user.requiredActions.
 *
 * Idempotent. Zgodnie z Zero Trust + NIST 800-63B: ALL privileged accounts
 * MUSZĄ mieć MFA — nie tylko superadmin.
 */

const ADMIN_PRIORITY_THRESHOLD = 90;

function buildPrivilegedRoleSet(): string[] {
  const roles = new Set<string>(SUPERADMIN_ROLES);
  for (const area of AREAS) {
    for (const r of area.kcRoles) {
      if (r.priority >= ADMIN_PRIORITY_THRESHOLD) roles.add(r.name);
    }
  }
  return Array.from(roles);
}
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

  // Resolve realm-management client UUID once — większość superadmin roles
  // (realm-admin, manage-realm) to CLIENT-LEVEL roles na realm-management
  // client, nie realm-level roles.
  let realmManagementClientId: string | null = null;
  try {
    const cRes = await keycloak.adminRequest(
      `/clients?clientId=realm-management`,
      token,
    );
    if (cRes.ok) {
      const cs = (await cRes.json()) as Array<{ id?: string }>;
      realmManagementClientId = cs[0]?.id ?? null;
    }
  } catch {
    /* ignore */
  }

  const privilegedRoles = buildPrivilegedRoleSet();
  for (const role of privilegedRoles) {
    try {
      // Najpierw spróbuj REALM role (np. `admin` w MyPerformance realm).
      let res = await keycloak.adminRequest(
        `/roles/${encodeURIComponent(role)}/users?max=200`,
        token,
      );
      // Jeśli 404 i mamy realm-management — spróbuj CLIENT role
      if (!res.ok && res.status === 404 && realmManagementClientId) {
        res = await keycloak.adminRequest(
          `/clients/${realmManagementClientId}/roles/${encodeURIComponent(role)}/users?max=200`,
          token,
        );
      }
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

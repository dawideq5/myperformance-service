import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import {
  ROLES,
  assertSingleRolePerArea,
  canAccessAdminPanel,
  canAccessChatwootAsAdmin,
  canAccessChatwootAsAgent,
  canAccessKeycloakAdmin,
  canAccessPanel,
  canAccessPostal,
  canManageCertificates,
  getAllAreaRoleNames,
  hasAnyRole,
  hasRole,
  isSuperAdmin,
  requireAdminPanel,
} from "@/lib/admin-auth";
import { ApiError } from "@/lib/api-utils";

function sessionWith(roles: string[]): Session {
  return {
    expires: "2099-01-01T00:00:00Z",
    user: { id: "u1", name: "Test", email: "test@example.com", roles },
    accessToken: "stub.access.token",
  } as unknown as Session;
}

describe("admin-auth", () => {
  describe("isSuperAdmin", () => {
    it("recognises realm-admin, manage-realm, admin", () => {
      expect(isSuperAdmin(sessionWith(["realm-admin"]))).toBe(true);
      expect(isSuperAdmin(sessionWith(["manage-realm"]))).toBe(true);
      expect(isSuperAdmin(sessionWith(["admin"]))).toBe(true);
    });

    it("returns false for non-super sessions", () => {
      expect(isSuperAdmin(sessionWith([ROLES.APP_USER]))).toBe(false);
      expect(isSuperAdmin(null)).toBe(false);
      expect(isSuperAdmin(undefined)).toBe(false);
    });
  });

  describe("hasRole / hasAnyRole", () => {
    it("matches exact role", () => {
      expect(hasRole(sessionWith([ROLES.CHATWOOT_AGENT]), ROLES.CHATWOOT_AGENT)).toBe(
        true,
      );
    });

    it("super-admin bypasses specific role check", () => {
      expect(hasRole(sessionWith(["realm-admin"]), "totally_made_up_role")).toBe(true);
    });

    it("returns false when no roles present", () => {
      expect(hasRole(sessionWith([]), ROLES.CHATWOOT_AGENT)).toBe(false);
      expect(hasRole(null, ROLES.CHATWOOT_AGENT)).toBe(false);
    });

    it("hasAnyRole matches at least one", () => {
      expect(
        hasAnyRole(sessionWith([ROLES.CHATWOOT_AGENT]), [
          ROLES.CHATWOOT_AGENT,
          ROLES.CHATWOOT_ADMIN,
        ]),
      ).toBe(true);
      expect(
        hasAnyRole(sessionWith([ROLES.APP_USER]), [
          ROLES.CHATWOOT_AGENT,
          ROLES.CHATWOOT_ADMIN,
        ]),
      ).toBe(false);
    });
  });

  describe("per-area access helpers", () => {
    it("canAccessChatwootAsAgent / Admin distinguish roles", () => {
      // Admin dziedziczy dostęp agenta (enterprise RBAC — admin ≥ agent).
      expect(canAccessChatwootAsAgent(sessionWith([ROLES.CHATWOOT_AGENT]))).toBe(
        true,
      );
      expect(canAccessChatwootAsAgent(sessionWith([ROLES.CHATWOOT_ADMIN]))).toBe(
        true,
      );
      expect(canAccessChatwootAsAdmin(sessionWith([ROLES.CHATWOOT_AGENT]))).toBe(
        false,
      );
      expect(canAccessChatwootAsAdmin(sessionWith([ROLES.CHATWOOT_ADMIN]))).toBe(
        true,
      );
    });

    it("canAccessPostal requires postal_admin", () => {
      expect(canAccessPostal(sessionWith([ROLES.POSTAL_ADMIN]))).toBe(true);
      expect(canAccessPostal(sessionWith([ROLES.APP_USER]))).toBe(false);
    });

    it("canManageCertificates requires certificates_admin", () => {
      expect(canManageCertificates(sessionWith([ROLES.CERTIFICATES_ADMIN]))).toBe(
        true,
      );
      expect(canManageCertificates(sessionWith([ROLES.APP_USER]))).toBe(false);
    });

    it("canAccessPanel maps panel key to role name", () => {
      expect(canAccessPanel(sessionWith(["sprzedawca"]), "sprzedawca")).toBe(true);
      expect(canAccessPanel(sessionWith(["serwisant"]), "sprzedawca")).toBe(false);
    });

    it("canAccessAdminPanel is gated by keycloak_admin", () => {
      expect(canAccessAdminPanel(sessionWith([ROLES.KEYCLOAK_ADMIN]))).toBe(true);
      expect(canAccessAdminPanel(sessionWith([ROLES.APP_USER]))).toBe(false);
      expect(canAccessKeycloakAdmin(sessionWith([ROLES.KEYCLOAK_ADMIN]))).toBe(true);
    });
  });

  describe("requireAdminPanel", () => {
    it("throws unauthorized when session missing or has no accessToken", () => {
      expect(() => requireAdminPanel(null)).toThrow(ApiError);
      expect(() => requireAdminPanel({ user: { id: "x" } } as unknown as Session)).toThrow(
        ApiError,
      );
    });

    it("throws forbidden when access token present but role missing", () => {
      const s = sessionWith([ROLES.APP_USER]);
      try {
        requireAdminPanel(s);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(403);
      }
    });

    it("passes when keycloak_admin role is present", () => {
      const s = sessionWith([ROLES.KEYCLOAK_ADMIN]);
      expect(() => requireAdminPanel(s)).not.toThrow();
    });
  });

  describe("assertSingleRolePerArea", () => {
    it("passes with at most one role per area", () => {
      expect(() =>
        assertSingleRolePerArea([ROLES.CHATWOOT_AGENT, ROLES.POSTAL_ADMIN]),
      ).not.toThrow();
    });

    it("rejects two roles within the same area", () => {
      expect(() =>
        assertSingleRolePerArea([ROLES.CHATWOOT_AGENT, ROLES.CHATWOOT_ADMIN]),
      ).toThrow(/Single-role-per-area/);
    });

    it("ignores roles unknown to the area registry", () => {
      expect(() => assertSingleRolePerArea(["unknown_role"])).not.toThrow();
    });
  });

  describe("getAllAreaRoleNames", () => {
    it("returns a flat de-duplicated list of area role names", () => {
      const names = getAllAreaRoleNames();
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain(ROLES.CHATWOOT_AGENT);
      expect(names).toContain(ROLES.POSTAL_ADMIN);
      expect(names).toContain(ROLES.KEYCLOAK_ADMIN);
    });
  });
});

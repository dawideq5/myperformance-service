import { describe, expect, it } from "vitest";
import {
  canChangeRepairType,
  canDeleteAnnex,
  canDeleteService,
  canEditServiceData,
  canManageInternalNotes,
  canOverridePriceAfterAnnex,
  canSetTerminalStatus,
  computeServiceActionPermissions,
  ensureServiceAdmin,
  isServiceSuperadmin,
  SERVICE_ADMIN_ROLES,
} from "@/lib/permissions/roles";

describe("permissions/roles (Wave 20 / Faza 1G)", () => {
  it("denies all action helpers when no roles", () => {
    expect(canEditServiceData([])).toBe(false);
    expect(canChangeRepairType([])).toBe(false);
    expect(canDeleteService([])).toBe(false);
    expect(canDeleteAnnex([])).toBe(false);
    expect(canOverridePriceAfterAnnex([])).toBe(false);
    expect(canSetTerminalStatus([])).toBe(false);
    expect(canManageInternalNotes([])).toBe(false);
    expect(isServiceSuperadmin([])).toBe(false);
  });

  it("denies for plain serwisant role", () => {
    const roles = ["serwisant", "app_user"];
    expect(canEditServiceData(roles)).toBe(false);
    expect(canDeleteService(roles)).toBe(false);
    expect(canSetTerminalStatus(roles)).toBe(false);
    expect(isServiceSuperadmin(roles)).toBe(false);
  });

  it("grants for service_admin role", () => {
    const roles = ["serwisant", "service_admin"];
    expect(canEditServiceData(roles)).toBe(true);
    expect(canChangeRepairType(roles)).toBe(true);
    expect(canDeleteService(roles)).toBe(true);
    expect(canDeleteAnnex(roles)).toBe(true);
    expect(canOverridePriceAfterAnnex(roles)).toBe(true);
    expect(canSetTerminalStatus(roles)).toBe(true);
    expect(canManageInternalNotes(roles)).toBe(true);
    // Plain service_admin is NOT a superadmin (KC realm-management only).
    expect(isServiceSuperadmin(roles)).toBe(false);
  });

  it("grants for KC superadmin (admin)", () => {
    const roles = ["admin"];
    expect(canEditServiceData(roles)).toBe(true);
    expect(canDeleteService(roles)).toBe(true);
    expect(isServiceSuperadmin(roles)).toBe(true);
  });

  it("grants for KC realm-admin / manage-realm", () => {
    expect(canEditServiceData(["realm-admin"])).toBe(true);
    expect(canEditServiceData(["manage-realm"])).toBe(true);
    expect(isServiceSuperadmin(["realm-admin"])).toBe(true);
    expect(isServiceSuperadmin(["manage-realm"])).toBe(true);
  });

  it("ensureServiceAdmin returns ok=true for admin", () => {
    expect(ensureServiceAdmin(["service_admin"])).toEqual({ ok: true });
    expect(ensureServiceAdmin(["admin"])).toEqual({ ok: true });
  });

  it("ensureServiceAdmin returns ok=false with reason for non-admin", () => {
    const r = ensureServiceAdmin(["serwisant"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/service_admin/);
    }
  });

  it("computeServiceActionPermissions builds full flag set", () => {
    const flags = computeServiceActionPermissions(["service_admin"]);
    expect(flags.canEditServiceData).toBe(true);
    expect(flags.canDeleteService).toBe(true);
    expect(flags.canSetTerminalStatus).toBe(true);

    const empty = computeServiceActionPermissions([]);
    expect(empty.canEditServiceData).toBe(false);
    expect(empty.canDeleteService).toBe(false);
  });

  it("SERVICE_ADMIN_ROLES contains expected role names", () => {
    expect(SERVICE_ADMIN_ROLES).toContain("service_admin");
    expect(SERVICE_ADMIN_ROLES).toContain("admin");
    expect(SERVICE_ADMIN_ROLES).toContain("realm-admin");
    expect(SERVICE_ADMIN_ROLES).toContain("manage-realm");
  });
});

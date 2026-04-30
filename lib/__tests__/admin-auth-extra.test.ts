import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import {
  ROLES,
  assertSingleRolePerArea,
  canAccessChatwootAsAgent,
  canAccessDocumensoAsAdmin,
  canAccessDocumensoAsManager,
  canAccessDocumensoAsMember,
  canAccessKnowledgeAdmin,
  canAccessKnowledgeAsEditor,
  canAccessKnowledgeBase,
  canAccessMoodleAsAdmin,
  canAccessMoodleAsStudent,
  canAccessMoodleAsTeacher,
  getAdminScopes,
  getRoleInArea,
  hasArea,
  isAnyAdmin,
  isAreaAdmin,
} from "@/lib/admin-auth";

function sessionWith(roles: string[]): Session {
  return {
    expires: "2099-01-01T00:00:00Z",
    user: { id: "u1", name: "Test", email: "test@example.com", roles },
    accessToken: "stub.access.token",
  } as unknown as Session;
}

describe("admin-auth — extra coverage", () => {
  describe("hasArea() with priority thresholds", () => {
    it("min: 10 (user) — chatwoot_agent passes, no role fails", () => {
      expect(hasArea(sessionWith([ROLES.CHATWOOT_AGENT]), "chatwoot", { min: 10 })).toBe(true);
      expect(hasArea(sessionWith([ROLES.CHATWOOT_ADMIN]), "chatwoot", { min: 10 })).toBe(true);
      expect(hasArea(sessionWith([]), "chatwoot", { min: 10 })).toBe(false);
    });

    it("min: 50 (manager) — only documenso_manager+ passes", () => {
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_MEMBER]), "documenso", { min: 50 })).toBe(false);
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_MANAGER]), "documenso", { min: 50 })).toBe(true);
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_ADMIN]), "documenso", { min: 50 })).toBe(true);
    });

    it("min: 90 (admin) — only admin passes; lower priorities fail", () => {
      expect(hasArea(sessionWith([ROLES.CHATWOOT_AGENT]), "chatwoot", { min: 90 })).toBe(false);
      expect(hasArea(sessionWith([ROLES.CHATWOOT_ADMIN]), "chatwoot", { min: 90 })).toBe(true);
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_MANAGER]), "documenso", { min: 90 })).toBe(false);
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_ADMIN]), "documenso", { min: 90 })).toBe(true);
    });

    it("super-admin always passes regardless of priority", () => {
      expect(hasArea(sessionWith(["realm-admin"]), "chatwoot", { min: 90 })).toBe(true);
      expect(hasArea(sessionWith(["admin"]), "documenso", { min: 90 })).toBe(true);
      expect(hasArea(sessionWith(["manage-realm"]), "anything", { min: 90 })).toBe(true);
    });

    it("returns false for unknown areaId", () => {
      expect(hasArea(sessionWith([ROLES.DOCUMENSO_ADMIN]), "totally-fake-area")).toBe(false);
    });

    it("dynamic Moodle role — prefix-match (moodle_editingteacher passes hasArea)", () => {
      expect(hasArea(sessionWith(["moodle_editingteacher"]), "moodle")).toBe(true);
      expect(hasArea(sessionWith(["moodle_test123"]), "moodle")).toBe(true);
      // Bez `min` (default 0) prefix match wystarcza nawet dla custom dynamic role.
      expect(hasArea(sessionWith(["moodle_random_role"]), "moodle", { min: 0 })).toBe(true);
    });
  });

  describe("findAreaForRole through hasArea — dynamic Moodle roles", () => {
    it("hasArea matches custom moodle_* roles via dynamicRoles prefix", () => {
      // moodle_editingteacher to non-seed, ale area moodle ma dynamicRoles=true.
      expect(hasArea(sessionWith(["moodle_editingteacher"]), "moodle")).toBe(true);
      expect(canAccessMoodleAsStudent(sessionWith(["moodle_editingteacher"]))).toBe(true);
    });

    it("canAccessMoodleAsTeacher recognises seed + alias roles", () => {
      expect(canAccessMoodleAsTeacher(sessionWith([ROLES.MOODLE_MANAGER]))).toBe(true);
      expect(canAccessMoodleAsTeacher(sessionWith(["moodle_editingteacher"]))).toBe(true);
      expect(canAccessMoodleAsTeacher(sessionWith(["moodle_teacher"]))).toBe(true);
      expect(canAccessMoodleAsTeacher(sessionWith(["moodle_coursecreator"]))).toBe(true);
      expect(canAccessMoodleAsTeacher(sessionWith([ROLES.MOODLE_STUDENT]))).toBe(false);
      expect(canAccessMoodleAsTeacher(sessionWith(["moodle_random"]))).toBe(false);
    });

    it("canAccessMoodleAsAdmin: priority bypass FIXED (faza-6 followup)", () => {
      // FIX (post-audit): hasArea() teraz respektuje `opts.min` dla dynamic-prefix
      // roles przez warunek `minPriority <= 50` (default priority dla custom).
      // Dla min:90 (admin) tylko seed roles z priority>=90 przechodzą — dynamic
      // prefix match jest pomijany. Bez fix-a `moodle_student` (priority 10)
      // przeszedłby canAccessMoodleAsAdmin → privilege escalation.
      expect(canAccessMoodleAsAdmin(sessionWith([ROLES.MOODLE_MANAGER]))).toBe(true);
      // FIX: seed priority 10 < min 90 → false (poprzednio bug-true).
      expect(canAccessMoodleAsAdmin(sessionWith([ROLES.MOODLE_STUDENT]))).toBe(false);
      // FIX: dynamic-only role (poza seedem) nie spełnia min:90 → false.
      expect(canAccessMoodleAsAdmin(sessionWith(["moodle_editingteacher"]))).toBe(false);
      expect(canAccessMoodleAsAdmin(sessionWith([ROLES.APP_USER]))).toBe(false);
      expect(canAccessMoodleAsAdmin(sessionWith([]))).toBe(false);
    });

    it("canAccessMoodleAsStudent: dynamic prefix STILL works dla niskich priority", () => {
      // Dla min:10 (student) dynamic prefix match nadal przechodzi (custom
      // priority default = 50, 50 ≥ 10). Custom Moodle role (np. moodle_xyz
      // dodana ręcznie w Moodle UI) daje dostęp do "student-tier" funkcji.
      expect(canAccessMoodleAsStudent(sessionWith([ROLES.MOODLE_STUDENT]))).toBe(true);
      expect(canAccessMoodleAsStudent(sessionWith(["moodle_editingteacher"]))).toBe(true);
      expect(canAccessMoodleAsStudent(sessionWith(["moodle_xyz_custom"]))).toBe(true);
      expect(canAccessMoodleAsStudent(sessionWith([ROLES.APP_USER]))).toBe(false);
    });
  });

  describe("assertSingleRolePerArea — edge cases", () => {
    it("passes with empty array", () => {
      expect(() => assertSingleRolePerArea([])).not.toThrow();
    });

    it("ignores unknown roles entirely", () => {
      expect(() =>
        assertSingleRolePerArea(["nope_one", "nope_two", "nope_three"]),
      ).not.toThrow();
    });

    it("rejects 3 roles within the same area", () => {
      expect(() =>
        assertSingleRolePerArea([
          ROLES.DOCUMENSO_MEMBER,
          ROLES.DOCUMENSO_MANAGER,
          ROLES.DOCUMENSO_ADMIN,
        ]),
      ).toThrow(/Single-role-per-area/);
    });

    it("rejects mix of seed + dynamic Moodle role in same area", () => {
      expect(() =>
        assertSingleRolePerArea([ROLES.MOODLE_STUDENT, "moodle_editingteacher"]),
      ).toThrow(/Single-role-per-area/);
    });

    it("passes with single roles spanning multiple distinct areas", () => {
      expect(() =>
        assertSingleRolePerArea([
          ROLES.DOCUMENSO_MEMBER,
          ROLES.CHATWOOT_AGENT,
          ROLES.POSTAL_ADMIN,
          ROLES.DIRECTUS_ADMIN,
        ]),
      ).not.toThrow();
    });

    it("error message contains both areaId and offending roles", () => {
      try {
        assertSingleRolePerArea([ROLES.CHATWOOT_AGENT, ROLES.CHATWOOT_ADMIN]);
        throw new Error("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toMatch(/chatwoot/);
        expect(msg).toMatch(/chatwoot_agent/);
        expect(msg).toMatch(/chatwoot_admin/);
      }
    });
  });

  describe("getAdminScopes()", () => {
    it("returns empty list for plain user", () => {
      expect(getAdminScopes(sessionWith([ROLES.APP_USER]))).toEqual([]);
      expect(getAdminScopes(null)).toEqual([]);
    });

    it("returns single scope for documenso_admin", () => {
      const scopes = getAdminScopes(sessionWith([ROLES.DOCUMENSO_ADMIN]));
      expect(scopes).toHaveLength(1);
      expect(scopes[0].areaId).toBe("documenso");
      expect(scopes[0].roleNames).toContain(ROLES.DOCUMENSO_ADMIN);
    });

    it("returns multiple scopes for cross-area admins", () => {
      const scopes = getAdminScopes(
        sessionWith([
          ROLES.DOCUMENSO_ADMIN,
          ROLES.CHATWOOT_ADMIN,
          ROLES.POSTAL_ADMIN,
        ]),
      );
      const ids = scopes.map((s) => s.areaId).sort();
      expect(ids).toContain("documenso");
      expect(ids).toContain("chatwoot");
      expect(ids).toContain("postal");
    });

    it("returns ALL scopes for super-admin (every area with admin role)", () => {
      const scopes = getAdminScopes(sessionWith(["realm-admin"]));
      // Każda area z priority>=90 powinna być na liście. Mamy ich co najmniej
      // 8 (chatwoot, moodle, directus, documenso, knowledge, postal, certificates,
      // stepca, keycloak, infrastructure, config-hub, email-admin).
      expect(scopes.length).toBeGreaterThanOrEqual(8);
    });

    it("does NOT include user/manager scopes (only priority>=90)", () => {
      const scopes = getAdminScopes(sessionWith([ROLES.DOCUMENSO_MANAGER]));
      // documenso_manager ma priority=50, a próg admin to 90 — więc lista pusta.
      expect(scopes).toHaveLength(0);
    });
  });

  describe("isAreaAdmin()", () => {
    it("true for matching area + super-admin", () => {
      expect(isAreaAdmin(sessionWith([ROLES.DOCUMENSO_ADMIN]), "documenso")).toBe(true);
      expect(isAreaAdmin(sessionWith(["realm-admin"]), "documenso")).toBe(true);
      expect(isAreaAdmin(sessionWith(["realm-admin"]), "totally-fake")).toBe(true);
    });

    it("false for non-admin role in same area", () => {
      expect(isAreaAdmin(sessionWith([ROLES.DOCUMENSO_MEMBER]), "documenso")).toBe(false);
      expect(isAreaAdmin(sessionWith([ROLES.DOCUMENSO_MANAGER]), "documenso")).toBe(false);
    });

    it("false for admin in DIFFERENT area", () => {
      expect(isAreaAdmin(sessionWith([ROLES.DOCUMENSO_ADMIN]), "chatwoot")).toBe(false);
      expect(isAreaAdmin(sessionWith([ROLES.POSTAL_ADMIN]), "documenso")).toBe(false);
    });
  });

  describe("isAnyAdmin()", () => {
    it("true for super-admin", () => {
      expect(isAnyAdmin(sessionWith(["realm-admin"]))).toBe(true);
      expect(isAnyAdmin(sessionWith(["manage-realm"]))).toBe(true);
    });

    it("true for any priority>=90 role", () => {
      expect(isAnyAdmin(sessionWith([ROLES.DOCUMENSO_ADMIN]))).toBe(true);
      expect(isAnyAdmin(sessionWith([ROLES.POSTAL_ADMIN]))).toBe(true);
    });

    it("false for member-tier or no roles", () => {
      expect(isAnyAdmin(sessionWith([ROLES.APP_USER]))).toBe(false);
      expect(isAnyAdmin(sessionWith([ROLES.DOCUMENSO_MEMBER]))).toBe(false);
      expect(isAnyAdmin(null)).toBe(false);
    });
  });

  describe("getRoleInArea() — priority resolution", () => {
    it("returns single seed role with nativeRoleId mapped", () => {
      const r = getRoleInArea(sessionWith([ROLES.DOCUMENSO_MANAGER]), "documenso");
      expect(r?.name).toBe(ROLES.DOCUMENSO_MANAGER);
      expect(r?.priority).toBe(50);
      expect(r?.nativeRoleId).toBe("MANAGER");
    });

    it("returns highest priority role when user has 2 roles in same area", () => {
      // Disordered userRoles: member podany pierwszy, ale admin powinien wygrać.
      const r = getRoleInArea(
        sessionWith([ROLES.DOCUMENSO_MEMBER, ROLES.DOCUMENSO_ADMIN]),
        "documenso",
      );
      expect(r?.name).toBe(ROLES.DOCUMENSO_ADMIN);
      expect(r?.priority).toBe(90);
      expect(r?.nativeRoleId).toBe("ADMIN");
    });

    it("returns highest priority role when user has 3 roles in same area", () => {
      const r = getRoleInArea(
        sessionWith([
          ROLES.KNOWLEDGE_VIEWER,
          ROLES.KNOWLEDGE_EDITOR,
          ROLES.KNOWLEDGE_ADMIN,
        ]),
        "knowledge",
      );
      expect(r?.name).toBe(ROLES.KNOWLEDGE_ADMIN);
      expect(r?.priority).toBe(90);
    });

    it("returns null for unknown area", () => {
      expect(getRoleInArea(sessionWith([ROLES.DOCUMENSO_ADMIN]), "no-such")).toBeNull();
    });

    it("returns null when user has no roles in area", () => {
      expect(getRoleInArea(sessionWith([ROLES.CHATWOOT_AGENT]), "documenso")).toBeNull();
    });
  });

  describe("Documenso 3-tier ladder", () => {
    it("admin satisfies member + manager + admin", () => {
      const s = sessionWith([ROLES.DOCUMENSO_ADMIN]);
      expect(canAccessDocumensoAsMember(s)).toBe(true);
      expect(canAccessDocumensoAsManager(s)).toBe(true);
      expect(canAccessDocumensoAsAdmin(s)).toBe(true);
    });

    it("manager satisfies member + manager but NOT admin", () => {
      const s = sessionWith([ROLES.DOCUMENSO_MANAGER]);
      expect(canAccessDocumensoAsMember(s)).toBe(true);
      expect(canAccessDocumensoAsManager(s)).toBe(true);
      expect(canAccessDocumensoAsAdmin(s)).toBe(false);
    });

    it("member satisfies only member", () => {
      const s = sessionWith([ROLES.DOCUMENSO_MEMBER]);
      expect(canAccessDocumensoAsMember(s)).toBe(true);
      expect(canAccessDocumensoAsManager(s)).toBe(false);
      expect(canAccessDocumensoAsAdmin(s)).toBe(false);
    });
  });

  describe("Knowledge 3-tier ladder", () => {
    it("editor satisfies viewer + editor but NOT admin", () => {
      const s = sessionWith([ROLES.KNOWLEDGE_EDITOR]);
      expect(canAccessKnowledgeBase(s)).toBe(true);
      expect(canAccessKnowledgeAsEditor(s)).toBe(true);
      expect(canAccessKnowledgeAdmin(s)).toBe(false);
    });
  });

  describe("Chatwoot tier ladder (admin ≥ agent)", () => {
    it("admin satisfies agent + admin", () => {
      const s = sessionWith([ROLES.CHATWOOT_ADMIN]);
      expect(canAccessChatwootAsAgent(s)).toBe(true);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  AREAS,
  findAreaForRole,
  getArea,
  isCustomRoleKcName,
  listAreaKcRoleNames,
  pickHighestPriorityRole,
} from "@/lib/permissions/areas";

describe("permissions/areas", () => {
  describe("AREAS registry", () => {
    it("has unique area ids", () => {
      const ids = AREAS.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every native area declares nativeProviderId", () => {
      for (const area of AREAS) {
        if (area.provider === "native") {
          expect(area.nativeProviderId, area.id).toBeTruthy();
        }
      }
    });

    it("every kcRole entry has a non-empty name and positive priority", () => {
      for (const area of AREAS) {
        for (const role of area.kcRoles) {
          expect(role.name.length, `${area.id}:${role.name}`).toBeGreaterThan(0);
          expect(role.priority, `${area.id}:${role.name}`).toBeGreaterThan(0);
        }
      }
    });

    it("role names are unique across all areas (no duplicates in different areas)", () => {
      const seen = new Map<string, string>();
      for (const area of AREAS) {
        for (const role of area.kcRoles) {
          if (seen.has(role.name)) {
            const prev = seen.get(role.name);
            // Same role may legitimately appear in multiple areas only when
            // intentional (e.g. keycloak_admin in both `keycloak` and `admin`).
            // Assert that this is one of the known exceptions, not accidental.
            expect(role.name, `${prev}↔${area.id}`).toBe("keycloak_admin");
          }
          seen.set(role.name, area.id);
        }
      }
    });
  });

  describe("getArea", () => {
    it("returns the matching area", () => {
      expect(getArea("chatwoot")?.id).toBe("chatwoot");
      expect(getArea("documenso")?.id).toBe("documenso");
    });

    it("returns null for unknown area", () => {
      expect(getArea("does-not-exist")).toBeNull();
    });
  });

  describe("findAreaForRole", () => {
    it("matches explicit seed roles", () => {
      expect(findAreaForRole("chatwoot_agent")?.id).toBe("chatwoot");
      expect(findAreaForRole("documenso_user")?.id).toBe("documenso");
      expect(findAreaForRole("moodle_student")?.id).toBe("moodle");
    });

    it("returns null for unrecognised roles", () => {
      expect(findAreaForRole("totally_unknown_role")).toBeNull();
    });
  });

  describe("listAreaKcRoleNames", () => {
    it("returns all role names for an area", () => {
      const chatwoot = getArea("chatwoot")!;
      const names = listAreaKcRoleNames(chatwoot);
      expect(names).toContain("chatwoot_agent");
      expect(names).toContain("chatwoot_administrator");
    });
  });

  describe("pickHighestPriorityRole", () => {
    it("returns the highest-priority role among the candidates", () => {
      const chatwoot = getArea("chatwoot")!;
      const picked = pickHighestPriorityRole(chatwoot, [
        "chatwoot_agent",
        "chatwoot_administrator",
      ]);
      expect(picked?.name).toBe("chatwoot_administrator");
    });

    it("returns null when no candidates match the area", () => {
      const chatwoot = getArea("chatwoot")!;
      expect(pickHighestPriorityRole(chatwoot, ["postal_admin"])).toBeNull();
    });

    it("returns null when candidates list is empty", () => {
      const chatwoot = getArea("chatwoot")!;
      expect(pickHighestPriorityRole(chatwoot, [])).toBeNull();
    });
  });

  describe("isCustomRoleKcName", () => {
    it("matches legacy custom role names", () => {
      expect(isCustomRoleKcName("chatwoot_custom_support")).toBe(true);
      expect(isCustomRoleKcName("moodle_custom_mentor")).toBe(true);
    });

    it("rejects canonical role names", () => {
      expect(isCustomRoleKcName("chatwoot_agent")).toBe(false);
      expect(isCustomRoleKcName("documenso_user")).toBe(false);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock keycloak — adminRequest + getServiceAccountToken są jedynymi
// I/O-related zależnościami testowanego modułu.
vi.mock("@/lib/keycloak", () => ({
  keycloak: {
    adminRequest: vi.fn(),
    getServiceAccountToken: vi.fn(async () => "stub-admin-token"),
  },
}));

vi.mock("@/lib/permissions/db", () => ({
  appendIamAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/permissions/registry", () => ({
  getProvider: vi.fn(),
  scheduleStartupKcSync: vi.fn(),
}));

function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permissions/kc-sync — ensureRealmRoleFromArea", () => {
  it("idempotent: gdy rola już istnieje + atrybuty matchują, NIE robi update", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    // 1. fetchRoleByName → istnieje, identyczne attrs
    adminReq.mockImplementation(async (path: string) => {
      if (path.startsWith("/roles/moodle_test123")) {
        return fakeRes(200, {
          id: "role-id-1",
          name: "moodle_test123",
          description: "Moodle role test123",
          attributes: {
            areaId: ["moodle"],
            label: ["test123"],
            priority: ["20"],
            seed: ["false"],
            nativeRoleId: ["test123"],
          },
        });
      }
      if (path === "/groups?briefRepresentation=false&max=500") {
        // group app-moodle istnieje już z rolą
        return fakeRes(200, [
          {
            id: "g-1",
            name: "app-moodle",
            realmRoles: ["moodle_test123"],
          },
        ]);
      }
      if (path === "/groups/g-1/role-mappings/realm") {
        return fakeRes(200, [{ id: "role-id-1", name: "moodle_test123" }]);
      }
      return fakeRes(404, "");
    });

    const { ensureRealmRoleFromArea } = await import(
      "@/lib/permissions/kc-sync"
    );
    const name = await ensureRealmRoleFromArea("moodle", "test123");
    expect(name).toBe("moodle_test123");

    // Sprawdzamy że NIE było POST /roles (createRole) ani PUT /roles-by-id.
    const calls = adminReq.mock.calls;
    expect(
      calls.some(
        (c) =>
          c[0] === "/roles" &&
          (c[2] as { method?: string } | undefined)?.method === "POST",
      ),
    ).toBe(false);
    expect(
      calls.some((c) => (c[0] as string).startsWith("/roles-by-id/")),
    ).toBe(false);
  });

  it("tworzy rolę gdy nie istnieje", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    let createdRole = false;
    adminReq.mockImplementation(async (path: string, _t: unknown, opts?: { method?: string }) => {
      if (path.startsWith("/roles/moodle_brandnew")) {
        return fakeRes(404, ""); // nie istnieje
      }
      if (path === "/roles" && opts?.method === "POST") {
        createdRole = true;
        return fakeRes(201, "");
      }
      if (path === "/groups?briefRepresentation=false&max=500") {
        return fakeRes(200, []); // group nie istnieje
      }
      if (path === "/groups" && opts?.method === "POST") {
        return fakeRes(201, "");
      }
      // refetch po createGroup
      return fakeRes(200, []);
    });

    const { ensureRealmRoleFromArea } = await import(
      "@/lib/permissions/kc-sync"
    );
    // ensureRoleInAreaGroup może się rozjechać przy refetch — nie testujemy
    // tutaj end-to-end group flow, tylko że createRole był wywołany.
    await ensureRealmRoleFromArea("moodle", "brandnew").catch(() => {
      // dopuszczamy że refetch po createGroup nie znajdzie — to nie blokuje
      // assertion że createRole był wywołany.
    });
    expect(createdRole).toBe(true);
  });
});

describe("permissions/kc-sync — inflight semaphore (syncAreasToKeycloak)", () => {
  it("2 concurrent syncAreasToKeycloak() share 1 actual run", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    let listRolesCallCount = 0;

    adminReq.mockImplementation(async (path: string) => {
      if (path === "/roles?briefRepresentation=false&max=500") {
        listRolesCallCount++;
        // sztuczna mikro-pauza, żeby drugie wywołanie zdążyło wystartować
        await new Promise((r) => setTimeout(r, 30));
        return fakeRes(200, []); // pusta lista — wszystko będzie tworzone od zera
      }
      // createRole — succeeded
      return fakeRes(201, "");
    });

    const { syncAreasToKeycloak } = await import(
      "@/lib/permissions/kc-sync"
    );
    const [a, b] = await Promise.all([
      syncAreasToKeycloak({ deleteStale: false }),
      syncAreasToKeycloak({ deleteStale: false }),
    ]);
    // Inflight semaphore w doSync: 2 callerzy widzą TĘ SAMĄ Promise →
    // listRoles został wywołany dokładnie raz.
    expect(listRolesCallCount).toBe(1);
    // Oba wyniki to ten sam obiekt.
    expect(a).toBe(b);
  });

  it("kolejne wywołanie po skończeniu poprzedniego startuje fresh sync", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    let listRolesCallCount = 0;
    adminReq.mockImplementation(async (path: string) => {
      if (path === "/roles?briefRepresentation=false&max=500") {
        listRolesCallCount++;
        return fakeRes(200, []);
      }
      return fakeRes(201, "");
    });

    const { syncAreasToKeycloak } = await import(
      "@/lib/permissions/kc-sync"
    );
    await syncAreasToKeycloak({ deleteStale: false });
    await syncAreasToKeycloak({ deleteStale: false });
    expect(listRolesCallCount).toBe(2);
  });
});

describe("permissions/kc-sync — stale cleanup (deleteStale)", () => {
  it("usuwa role z atrybutem areaId których nie ma w AREAS", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    const deletedNames: string[] = [];

    adminReq.mockImplementation(async (path: string, _t: unknown, opts?: { method?: string }) => {
      if (path === "/roles?briefRepresentation=false&max=500") {
        // 2 stale role + 1 valid (chatwoot_agent jest w AREAS).
        return fakeRes(200, [
          {
            id: "id-stale-1",
            name: "moodle_oldrole",
            attributes: { areaId: ["moodle"] },
          },
          {
            id: "id-stale-2",
            name: "documenso_droppedone",
            attributes: { areaId: ["documenso"] },
          },
          {
            // bez areaId — nasz no-touch ("admin", "manage-realm" itd.)
            id: "id-leave-alone",
            name: "manage-realm",
            attributes: {},
          },
          {
            // kanoniczny seed — pokrywa się z AREAS, NIE usuwamy.
            id: "id-keep-seed",
            name: "chatwoot_agent",
            attributes: { areaId: ["chatwoot"] },
          },
        ]);
      }
      if (
        opts?.method === "DELETE" &&
        path.startsWith("/roles/")
      ) {
        const name = decodeURIComponent(path.replace("/roles/", ""));
        deletedNames.push(name);
        return fakeRes(204, "");
      }
      // upsert / etc. — succeed.
      return fakeRes(201, "");
    });

    const { syncAreasToKeycloak } = await import(
      "@/lib/permissions/kc-sync"
    );
    const result = await syncAreasToKeycloak({ deleteStale: true });
    expect(deletedNames).toContain("moodle_oldrole");
    expect(deletedNames).toContain("documenso_droppedone");
    expect(deletedNames).not.toContain("manage-realm");
    expect(deletedNames).not.toContain("chatwoot_agent");
    expect(result.rolesDeleted).toBeGreaterThanOrEqual(2);
  });

  it("deleteStale: false NIE usuwa nic — tylko upsert", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    let deleteCalls = 0;
    adminReq.mockImplementation(async (path: string, _t: unknown, opts?: { method?: string }) => {
      if (path === "/roles?briefRepresentation=false&max=500") {
        return fakeRes(200, [
          {
            id: "id-stale",
            name: "moodle_old",
            attributes: { areaId: ["moodle"] },
          },
        ]);
      }
      if (opts?.method === "DELETE") {
        deleteCalls++;
        return fakeRes(204, "");
      }
      return fakeRes(201, "");
    });

    const { syncAreasToKeycloak } = await import(
      "@/lib/permissions/kc-sync"
    );
    const result = await syncAreasToKeycloak({ deleteStale: false });
    expect(deleteCalls).toBe(0);
    expect(result.rolesDeleted).toBe(0);
  });
});

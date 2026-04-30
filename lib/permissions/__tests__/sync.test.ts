import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock musi być na top — vitest hoistuje przed importem testowanego modułu.
// Nie importujemy `sync.ts` tutaj wcześnie: każdy test używa await import()
// po przeprowadzeniu reset/mocków.

// ── Mock dependencies ──────────────────────────────────────────────────────
vi.mock("@/lib/keycloak", () => ({
  keycloak: {
    adminRequest: vi.fn(),
    getServiceAccountToken: vi.fn(async () => "stub-admin-token"),
  },
}));

vi.mock("@/lib/permissions/registry", () => ({
  getProvider: vi.fn(),
  listConfiguredProviders: vi.fn(() => []),
}));

vi.mock("@/lib/permissions/db", () => ({
  appendIamAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/permissions/kc-sync", () => ({
  ensureRealmRoleFromArea: vi.fn(async () => "moodle_test"),
  scheduleStartupKcSync: vi.fn(),
}));

vi.mock("@/lib/permissions/queue", () => ({
  enqueueJob: vi.fn(async () => {}),
  registerJobHandler: vi.fn(),
}));

// Helper do stubowania `keycloak.adminRequest`. Zwraca obiekt zgodny z Response.
function fakeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response;
}

// Default mock provider — gotowy szablon do override w testach.
function makeProvider(overrides: Partial<{
  id: string;
  isConfigured: boolean;
  syncUserProfile: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  listUserEmails: ReturnType<typeof vi.fn>;
  assignUserRole: ReturnType<typeof vi.fn>;
  listRoles: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    id: overrides.id ?? "stub-provider",
    label: "Stub",
    isConfigured: () => overrides.isConfigured ?? true,
    supportsCustomRoles: () => false,
    listPermissions: vi.fn(async () => []),
    listRoles: overrides.listRoles ?? vi.fn(async () => []),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    assignUserRole: overrides.assignUserRole ?? vi.fn(async () => {}),
    getUserRole: vi.fn(async () => null),
    syncUserProfile:
      overrides.syncUserProfile ?? vi.fn(async () => {}),
    deleteUser: overrides.deleteUser ?? vi.fn(async () => {}),
    listUserEmails:
      overrides.listUserEmails ?? vi.fn(async () => null),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permissions/sync — propagateProfileFromKc", () => {
  it("OK dla 1 providera — happy path", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    // getKcUser → /users/:id?userProfileMetadata=true
    adminReq.mockResolvedValueOnce(
      fakeRes(200, {
        id: "u-1",
        email: "user@example.com",
        firstName: "Jan",
        lastName: "Kowalski",
      }),
    );

    const { getProvider } = await import("@/lib/permissions/registry");
    const okProvider = makeProvider({ id: "documenso" });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) =>
        id === "documenso" ? okProvider : null,
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.propagateProfileFromKc("u-1");

    // documenso → ok, reszta (chatwoot, moodle, …) → skipped (provider null).
    const ok = results.filter((r) => r.status === "ok");
    const skipped = results.filter((r) => r.status === "skipped");
    expect(ok).toHaveLength(1);
    expect(ok[0].areaId).toBe("documenso");
    expect(skipped.length).toBeGreaterThan(0);
    expect(okProvider.syncUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.com" }),
    );
  });

  it("partial fail — jeden provider rzuca, inni przechodzą", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(
      fakeRes(200, {
        id: "u-2",
        email: "user2@example.com",
        firstName: "Anna",
        lastName: "Nowak",
      }),
    );

    const { getProvider } = await import("@/lib/permissions/registry");
    const goodProvider = makeProvider({ id: "documenso" });
    const failProvider = makeProvider({
      id: "chatwoot",
      syncUserProfile: vi.fn(async () => {
        throw new Error("chatwoot down");
      }),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) => {
        if (id === "documenso") return goodProvider;
        if (id === "chatwoot") return failProvider;
        return null;
      },
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.propagateProfileFromKc("u-2");

    const ok = results.find((r) => r.areaId === "documenso");
    const failed = results.find((r) => r.areaId === "chatwoot");
    expect(ok?.status).toBe("ok");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toMatch(/chatwoot down/);
  });

  it("zwraca skipped gdy KC user nie ma email", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(fakeRes(200, { id: "u-3" }));

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.propagateProfileFromKc("u-3");
    expect(results).toEqual([{ areaId: "*", status: "skipped" }]);
  });
});

describe("permissions/sync — deprovisionUser (parallel fan-out)", () => {
  it("wywołuje deleteUser na wszystkich skonfigurowanych providerach", async () => {
    const { getProvider } = await import("@/lib/permissions/registry");
    const documenso = makeProvider({ id: "documenso" });
    const moodle = makeProvider({ id: "moodle" });
    const chatwoot = makeProvider({ id: "chatwoot" });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) => {
        if (id === "documenso") return documenso;
        if (id === "moodle") return moodle;
        if (id === "chatwoot") return chatwoot;
        return null;
      },
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.deprovisionUser({ email: "x@y.com" });

    expect(documenso.deleteUser).toHaveBeenCalledWith({
      email: "x@y.com",
      previousEmail: undefined,
    });
    expect(moodle.deleteUser).toHaveBeenCalledOnce();
    expect(chatwoot.deleteUser).toHaveBeenCalledOnce();

    const ok = results.filter((r) => r.status === "ok");
    expect(ok.length).toBeGreaterThanOrEqual(3);
  });

  it("kontynuuje gdy jeden provider rzuci — reszta dostaje 'failed'", async () => {
    const { getProvider } = await import("@/lib/permissions/registry");
    const ok = makeProvider({ id: "documenso" });
    const fail = makeProvider({
      id: "chatwoot",
      deleteUser: vi.fn(async () => {
        throw new Error("rate limit");
      }),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) => {
        if (id === "documenso") return ok;
        if (id === "chatwoot") return fail;
        return null;
      },
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.deprovisionUser({ email: "fail@y.com" });
    const okR = results.find((r) => r.areaId === "documenso");
    const failR = results.find((r) => r.areaId === "chatwoot");
    expect(okR?.status).toBe("ok");
    expect(failR?.status).toBe("failed");
    expect(failR?.error).toMatch(/rate limit/);
  });

  it("dedupuje providerów (np. moodle area + same provider w innej area)", async () => {
    const { getProvider } = await import("@/lib/permissions/registry");
    // Wszystkie area natywne wskazują "documenso" — powinno wywołać delete tylko raz.
    const documenso = makeProvider({ id: "documenso" });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(documenso);

    const sync = await import("@/lib/permissions/sync");
    await sync.deprovisionUser({ email: "x@y.com" });
    expect(documenso.deleteUser).toHaveBeenCalledTimes(1);
  });
});

describe("permissions/sync — reconcileUsers", () => {
  it("dryrun (apply=false) zwraca drift list i NIE woła deleteUser", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    // listAllKcUserEmails: 1 strona, 2 emaile, < max=100 → break.
    adminReq.mockResolvedValueOnce(
      fakeRes(200, [
        { email: "alice@example.com" },
        { email: "bob@example.com" },
      ]),
    );

    const { getProvider } = await import("@/lib/permissions/registry");
    const provider = makeProvider({
      id: "documenso",
      listUserEmails: vi.fn(async () => [
        "alice@example.com",
        "bob@example.com",
        "drift1@example.com",
        "drift2@example.com",
      ]),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) =>
        id === "documenso" ? provider : null,
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.reconcileUsers({ apply: false });
    const doc = results.find((r) => r.providerId === "documenso");
    expect(doc?.drifted).toEqual(["drift1@example.com", "drift2@example.com"]);
    expect(doc?.deleted).toEqual([]);
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("apply=true z 5 drifted — concurrency=3 (≤3 inflight w danym momencie)", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    // KC zwraca 0 emaili, drift = wszystkie z providera.
    adminReq.mockResolvedValueOnce(fakeRes(200, []));

    let inflight = 0;
    let maxInflight = 0;
    const drift = ["a@x", "b@x", "c@x", "d@x", "e@x"];
    const { getProvider } = await import("@/lib/permissions/registry");
    const provider = makeProvider({
      id: "documenso",
      listUserEmails: vi.fn(async () => drift),
      deleteUser: vi.fn(async () => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        // micro delay symulujący IO
        await new Promise((r) => setTimeout(r, 10));
        inflight--;
      }),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) =>
        id === "documenso" ? provider : null,
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.reconcileUsers({ apply: true });
    expect(maxInflight).toBeLessThanOrEqual(3);
    expect(maxInflight).toBeGreaterThan(0);
    const doc = results.find((r) => r.providerId === "documenso");
    expect(doc?.deleted.sort()).toEqual([...drift].sort());
    expect(provider.deleteUser).toHaveBeenCalledTimes(5);
  });

  it("apply=true rejestruje failed gdy provider.deleteUser rzuci", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(fakeRes(200, []));

    const { getProvider } = await import("@/lib/permissions/registry");
    const provider = makeProvider({
      id: "documenso",
      listUserEmails: vi.fn(async () => ["bad@x", "good@x"]),
      deleteUser: vi.fn(async ({ email }: { email: string }) => {
        if (email === "bad@x") throw new Error("FK violation");
      }),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) =>
        id === "documenso" ? provider : null,
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.reconcileUsers({ apply: true });
    const doc = results.find((r) => r.providerId === "documenso");
    expect(doc?.deleted).toEqual(["good@x"]);
    expect(doc?.failed).toEqual([{ email: "bad@x", error: "FK violation" }]);
  });

  it("oznacza skipped gdy provider zwraca null z listUserEmails", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(fakeRes(200, []));

    const { getProvider } = await import("@/lib/permissions/registry");
    const provider = makeProvider({
      id: "documenso",
      listUserEmails: vi.fn(async () => null),
    });
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation(
      (id: string | null | undefined) =>
        id === "documenso" ? provider : null,
    );

    const sync = await import("@/lib/permissions/sync");
    const results = await sync.reconcileUsers({ apply: false });
    const doc = results.find((r) => r.providerId === "documenso");
    expect(doc?.skipped).toMatch(/listUserEmails returned null/);
  });
});

describe("permissions/sync — getUserAreaAssignments priority resolution", () => {
  it("zwraca null gdy user nie ma żadnej roli z area", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    // listUserRealmRoles → []
    adminReq.mockResolvedValueOnce(fakeRes(200, []));

    const sync = await import("@/lib/permissions/sync");
    const out = await sync.getUserAreaAssignments("user-id");
    // każda area bez roli = null
    const documenso = out.find((a) => a.areaId === "documenso");
    expect(documenso?.roleName).toBeNull();
  });

  it("wybiera najwyższy priority gdy user ma 2 role w area (manager + admin → admin)", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(
      fakeRes(200, [
        { id: "r1", name: "documenso_manager" },
        { id: "r2", name: "documenso_admin" },
      ]),
    );

    const sync = await import("@/lib/permissions/sync");
    const out = await sync.getUserAreaAssignments("user-id");
    const documenso = out.find((a) => a.areaId === "documenso");
    expect(documenso?.roleName).toBe("documenso_admin");
  });

  it("wybiera najwyższy z 3 (member + manager + admin → admin)", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(
      fakeRes(200, [
        { id: "r1", name: "documenso_member" },
        { id: "r2", name: "documenso_manager" },
        { id: "r3", name: "documenso_admin" },
      ]),
    );

    const sync = await import("@/lib/permissions/sync");
    const out = await sync.getUserAreaAssignments("user-id");
    const documenso = out.find((a) => a.areaId === "documenso");
    expect(documenso?.roleName).toBe("documenso_admin");
  });

  it("zachowuje custom (non-seed) rolę gdy żadna seed nie pasuje", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(
      fakeRes(200, [{ id: "r1", name: "moodle_editingteacher" }]),
    );

    const sync = await import("@/lib/permissions/sync");
    const out = await sync.getUserAreaAssignments("user-id");
    const moodle = out.find((a) => a.areaId === "moodle");
    expect(moodle?.roleName).toBe("moodle_editingteacher");
  });

  it("ignoruje role spoza AREAS rejestru (np. realm-management)", async () => {
    const { keycloak } = await import("@/lib/keycloak");
    const adminReq = keycloak.adminRequest as ReturnType<typeof vi.fn>;
    adminReq.mockResolvedValueOnce(
      fakeRes(200, [
        { id: "r0", name: "manage-realm" }, // poza area
        { id: "r1", name: "chatwoot_admin" },
      ]),
    );

    const sync = await import("@/lib/permissions/sync");
    const out = await sync.getUserAreaAssignments("user-id");
    const chatwoot = out.find((a) => a.areaId === "chatwoot");
    expect(chatwoot?.roleName).toBe("chatwoot_admin");
  });
});

describe("permissions/sync — mapKcToNativeRoleId", () => {
  it("zwraca seed.nativeRoleId dla seed roli", async () => {
    const { mapKcToNativeRoleId } = await import("@/lib/permissions/sync");
    const { getArea } = await import("@/lib/permissions/areas");
    const documenso = getArea("documenso")!;
    expect(mapKcToNativeRoleId(documenso, "documenso_admin")).toBe("ADMIN");
    expect(mapKcToNativeRoleId(documenso, "documenso_manager")).toBe("MANAGER");
    expect(mapKcToNativeRoleId(documenso, "documenso_member")).toBe("MEMBER");
  });

  it("używa attributes.nativeRoleId[0] gdy seed nie pasuje", async () => {
    const { mapKcToNativeRoleId } = await import("@/lib/permissions/sync");
    const { getArea } = await import("@/lib/permissions/areas");
    const moodle = getArea("moodle")!;
    expect(
      mapKcToNativeRoleId(moodle, "moodle_unknown_x", {
        nativeRoleId: ["editingteacher"],
      }),
    ).toBe("editingteacher");
  });

  it("fallback strip-prefix gdy nie ma seedu ani attrs", async () => {
    const { mapKcToNativeRoleId } = await import("@/lib/permissions/sync");
    const { getArea } = await import("@/lib/permissions/areas");
    const moodle = getArea("moodle")!;
    expect(mapKcToNativeRoleId(moodle, "moodle_editingteacher")).toBe(
      "editingteacher",
    );
  });

  it("zwraca null gdy nie ma żadnej heurystyki", async () => {
    const { mapKcToNativeRoleId } = await import("@/lib/permissions/sync");
    const { getArea } = await import("@/lib/permissions/areas");
    const documenso = getArea("documenso")!;
    expect(mapKcToNativeRoleId(documenso, "totally-unrelated")).toBeNull();
  });
});

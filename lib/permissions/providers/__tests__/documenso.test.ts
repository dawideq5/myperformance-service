import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pg.Pool jest jedyną zewnętrzną zależnością — tworzymy fabrykę poola
// z mockowanym `connect()` zwracającym mockowanego klienta.

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const clientCalls: Array<{ sql: string; args: unknown[] }> = [];
let mockQueryImpl: (sql: string, args: unknown[]) => unknown = () => ({ rowCount: 0, rows: [] });
let pgErrorOnce: (Error & { code?: string }) | null = null;

function makeClient(): MockClient {
  const c: MockClient = {
    query: vi.fn(async (sql: string, args?: unknown[]) => {
      clientCalls.push({ sql, args: args ?? [] });
      if (pgErrorOnce) {
        const err = pgErrorOnce;
        pgErrorOnce = null;
        throw err;
      }
      return mockQueryImpl(sql, args ?? []);
    }),
    release: vi.fn(() => {}),
  };
  return c;
}

vi.mock("pg", () => {
  class FakePool {
    private clients: MockClient[] = [];
    constructor() {}
    async connect(): Promise<MockClient> {
      const c = makeClient();
      this.clients.push(c);
      return c;
    }
    on() {}
  }
  return { Pool: FakePool, default: { Pool: FakePool } };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  clientCalls.length = 0;
  pgErrorOnce = null;
  mockQueryImpl = () => ({ rowCount: 0, rows: [] });
  process.env.DOCUMENSO_DB_URL = "postgres://stub";
  delete process.env.DOCUMENSO_TEAM_ID;
  delete process.env.DOCUMENSO_ORGANISATION_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DOCUMENSO_DB_URL;
  delete process.env.DOCUMENSO_TEAM_ID;
  delete process.env.DOCUMENSO_ORGANISATION_ID;
});

describe("documenso provider — assignUserRole transaction flow", () => {
  it("rzuca ProviderNotConfiguredError gdy brak env", async () => {
    delete process.env.DOCUMENSO_DB_URL;
    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(
      p.assignUserRole({
        email: "x@x",
        displayName: "X",
        roleId: "MEMBER",
      }),
    ).rejects.toThrow(/not configured/);
  });

  it("przebiega BEGIN → UPDATE User → COMMIT (bez orgId)", async () => {
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.assignUserRole({
      email: "user@example.com",
      displayName: "User Example",
      roleId: "ADMIN",
    });

    const sqls = clientCalls.map((c) => c.sql.trim());
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.some((s) => s.startsWith('UPDATE "User"'))).toBe(true);
    expect(sqls).toContain("COMMIT");
    // Argumenty UPDATE: email + globalRoles dla ADMIN = ['USER','ADMIN'].
    const updateCall = clientCalls.find((c) =>
      /UPDATE "User"/.test(c.sql),
    );
    expect(updateCall?.args[0]).toBe("user@example.com");
    expect(updateCall?.args[1]).toEqual(["USER", "ADMIN"]);
  });

  it("z DOCUMENSO_ORGANISATION_ID — wywołuje INSERT OrganisationMember + grupowy flow", async () => {
    process.env.DOCUMENSO_ORGANISATION_ID = "org-uuid";
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) return { rowCount: 1, rows: [] };
      if (/SELECT id FROM "User"/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: 42 }] };
      }
      if (/SELECT id FROM "OrganisationGroup"/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "group-id-1" }] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.assignUserRole({
      email: "u@e.com",
      displayName: "U E",
      roleId: "MANAGER",
    });

    const sqls = clientCalls.map((c) => c.sql.trim());
    expect(sqls).toContain("BEGIN");
    expect(sqls).toContain("COMMIT");
    expect(
      sqls.some((s) =>
        /DELETE FROM "Organisation"\s+WHERE type = 'PERSONAL'/i.test(s),
      ),
    ).toBe(true);
    expect(
      sqls.some((s) =>
        /INSERT INTO "OrganisationMember"/i.test(s),
      ),
    ).toBe(true);
    expect(
      sqls.some((s) =>
        /INSERT INTO "OrganisationGroupMember"/i.test(s),
      ),
    ).toBe(true);
  });

  it("ROLLBACK gdy query rzuci nie-deadlock błąd (FK violation)", async () => {
    let attempted = false;
    mockQueryImpl = (sql) => {
      if (!attempted && /UPDATE "User"/i.test(sql)) {
        attempted = true;
        const err = new Error("FK violation") as Error & { code?: string };
        err.code = "23503";
        // rzucamy via pgErrorOnce na NEXT call (uproszczona symulacja:
        // robimy to przez throw bezpośredni)
        throw err;
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await expect(
      p.assignUserRole({
        email: "x@y.com",
        displayName: "X",
        roleId: "MEMBER",
      }),
    ).rejects.toThrow(/FK violation/);

    const sqls = clientCalls.map((c) => c.sql.trim());
    expect(sqls).toContain("BEGIN");
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });
});

describe("documenso provider — withDeadlockRetry", () => {
  it("retry 3× gdy code=40P01, ostatecznie sukces", async () => {
    let attempts = 0;
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) {
        attempts++;
        if (attempts < 3) {
          const err = new Error("deadlock") as Error & { code?: string };
          err.code = "40P01";
          throw err;
        }
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.assignUserRole({
      email: "u@e.com",
      displayName: "U E",
      roleId: "MEMBER",
    });
    expect(attempts).toBe(3);
  });

  it("po 3 próbach 40P01 — propaguje błąd", async () => {
    let attempts = 0;
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) {
        attempts++;
        const err = new Error("perma deadlock") as Error & { code?: string };
        err.code = "40P01";
        throw err;
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await expect(
      p.assignUserRole({
        email: "u@e.com",
        displayName: "U",
        roleId: "MEMBER",
      }),
    ).rejects.toThrow(/perma deadlock/);
    // 3 attempts max
    expect(attempts).toBe(3);
  });

  it("retry również dla code=40001 (serialization_failure)", async () => {
    let attempts = 0;
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) {
        attempts++;
        if (attempts < 2) {
          const err = new Error("serialization") as Error & { code?: string };
          err.code = "40001";
          throw err;
        }
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.assignUserRole({
      email: "u@e.com",
      displayName: "U",
      roleId: "ADMIN",
    });
    expect(attempts).toBe(2);
  });

  it("NO retry dla innego błędu (np. 23503 FK)", async () => {
    let attempts = 0;
    mockQueryImpl = (sql) => {
      if (/^UPDATE "User"/i.test(sql.trim())) {
        attempts++;
        const err = new Error("fk fail") as Error & { code?: string };
        err.code = "23503";
        throw err;
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await expect(
      p.assignUserRole({
        email: "u@e.com",
        displayName: "U",
        roleId: "MEMBER",
      }),
    ).rejects.toThrow(/fk fail/);
    expect(attempts).toBe(1);
  });
});

describe("documenso provider — deleteUser anonymization", () => {
  it("anonimizuje email + name, usuwa członkostwa, invaliduje sesje", async () => {
    let userIdLookup = 0;
    mockQueryImpl = (sql) => {
      if (/SELECT id FROM "User"/i.test(sql)) {
        userIdLookup++;
        return { rowCount: 1, rows: [{ id: 7 }] };
      }
      return { rowCount: 1, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.deleteUser({ email: "removeme@x.com" });

    const sqls = clientCalls.map((c) => c.sql.trim());
    expect(sqls).toContain("BEGIN");
    expect(
      sqls.some((s) =>
        /DELETE FROM "OrganisationMember" WHERE "userId" = \$1/i.test(s),
      ),
    ).toBe(true);
    expect(
      sqls.some((s) =>
        /DELETE FROM "Session" WHERE "userId" = \$1/i.test(s),
      ),
    ).toBe(true);
    // UPDATE z email='deleted+<id>@deleted.local'
    const updateAnon = clientCalls.find((c) =>
      /UPDATE "User"\s+SET email = \$2/i.test(c.sql),
    );
    expect(updateAnon).toBeDefined();
    const args = updateAnon!.args as [number, string];
    expect(args[0]).toBe(7);
    expect(args[1]).toBe("deleted+7@deleted.local");
    expect(sqls).toContain("COMMIT");
  });

  it("ROLLBACK gdy user nie znaleziony (no-op)", async () => {
    mockQueryImpl = (sql) => {
      if (/SELECT id FROM "User"/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.deleteUser({ email: "ghost@x.com" });

    const sqls = clientCalls.map((c) => c.sql.trim());
    expect(sqls).toContain("BEGIN");
    expect(sqls).toContain("ROLLBACK");
    // Nie wykonywaliśmy UPDATE/DELETE — wczesny ROLLBACK po SELECT id.
    expect(
      sqls.some((s) => /UPDATE "User"/i.test(s)),
    ).toBe(false);
  });

  it("używa previousEmail jako lookup gdy podany", async () => {
    let lookupUsed: string | null = null;
    mockQueryImpl = (sql, args) => {
      if (/SELECT id FROM "User"/i.test(sql)) {
        lookupUsed = args[0] as string;
        return { rowCount: 1, rows: [{ id: 99 }] };
      }
      return { rowCount: 1, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.deleteUser({
      email: "new@x.com",
      previousEmail: "old@x.com",
    });
    expect(lookupUsed).toBe("old@x.com");
  });

  it("retry 40P01 też dla deleteUser", async () => {
    let attempts = 0;
    mockQueryImpl = (sql) => {
      if (/^BEGIN$/i.test(sql.trim())) {
        attempts++;
        if (attempts < 2) {
          const err = new Error("dl") as Error & { code?: string };
          err.code = "40P01";
          throw err;
        }
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT id FROM "User"/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    };

    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    await p.deleteUser({ email: "u@x" });
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});

describe("documenso provider — listRoles & metadata", () => {
  it("listRoles zwraca 3 statyczne tiery (MEMBER/MANAGER/ADMIN)", async () => {
    mockQueryImpl = () => ({ rowCount: 0, rows: [] });
    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    const roles = await p.listRoles();
    const ids = roles.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["MEMBER", "MANAGER", "ADMIN"]));
    expect(roles.every((r) => r.systemDefined)).toBe(true);
  });

  it("supportsCustomRoles returns false (Documenso ma sztywną enumerację)", async () => {
    const { DocumensoProvider } = await import(
      "@/lib/permissions/providers/documenso"
    );
    const p = new DocumensoProvider();
    expect(p.supportsCustomRoles()).toBe(false);
    await expect(
      p.createRole({ name: "x", description: "", permissions: [] }),
    ).rejects.toThrow(/does not support/);
  });
});

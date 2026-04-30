import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock mysql2/promise — jedyna DB zależność.
const dbQueryQueue: Array<unknown> = [];
let dbThrowOnce: Error | null = null;
const dbQueryCalls: Array<{ sql: string; args: unknown[] }> = [];
const fetchCalls: Array<{ url: string; body: string }> = [];

vi.mock("mysql2/promise", () => {
  return {
    default: {
      createPool: () => ({
        async query(sql: string, args?: unknown[]) {
          dbQueryCalls.push({ sql, args: args ?? [] });
          if (dbThrowOnce) {
            const e = dbThrowOnce;
            dbThrowOnce = null;
            throw e;
          }
          if (dbQueryQueue.length > 0) {
            return [dbQueryQueue.shift(), undefined];
          }
          return [[], undefined];
        },
      }),
    },
    createPool: () => ({
      async query(sql: string, args?: unknown[]) {
        dbQueryCalls.push({ sql, args: args ?? [] });
        if (dbThrowOnce) {
          const e = dbThrowOnce;
          dbThrowOnce = null;
          throw e;
        }
        if (dbQueryQueue.length > 0) {
          return [dbQueryQueue.shift(), undefined];
        }
        return [[], undefined];
      },
    }),
  };
});

// fetch — Moodle WS calls.
let fetchHandlers: Array<(url: string, body: string) => unknown> = [];

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  dbQueryQueue.length = 0;
  dbThrowOnce = null;
  dbQueryCalls.length = 0;
  fetchCalls.length = 0;
  fetchHandlers = [];

  process.env.MOODLE_URL = "https://moodle.test";
  process.env.MOODLE_API_TOKEN = "stub-token";
  delete process.env.MOODLE_DB_URL;

  globalThis.fetch = vi.fn(async (input: unknown, init?: { body?: BodyInit }) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    fetchCalls.push({ url, body });
    const handler = fetchHandlers.shift();
    const data = handler ? handler(url, body) : { exception: null };
    return {
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.MOODLE_URL;
  delete process.env.MOODLE_API_TOKEN;
  delete process.env.MOODLE_DB_URL;
});

describe("moodle provider — listRoles", () => {
  it("DB fallback: gdy MOODLE_DB_URL skonfigurowany — czyta z mdl_role", async () => {
    process.env.MOODLE_DB_URL = "mysql://stub";
    dbQueryQueue.push([
      { id: 1, shortname: "manager", name: "Menedżer", description: "Mgr" },
      { id: 5, shortname: "student", name: "Student", description: "Std" },
      { id: 9, shortname: "custom_mentor", name: "Mentor", description: null },
    ]);

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const roles = await p.listRoles();
    expect(roles.map((r) => r.id)).toEqual([
      "manager",
      "student",
      "custom_mentor",
    ]);
    // id<=8 → systemDefined
    const sysCount = roles.filter((r) => r.systemDefined).length;
    expect(sysCount).toBe(2);
    // Nie wywołał WS — DB ma pierwszeństwo.
    expect(fetchCalls).toHaveLength(0);
  });

  it("DB fallback aktywuje się gdy WS rzuca invalidrecord (Moodle 5 bug)", async () => {
    // Brak MOODLE_DB_URL → WS path. WS zwraca exception "invalidrecord".
    fetchHandlers.push(() => ({
      exception: "invalidrecord",
      message: "Nie znaleziono rekordu",
    }));

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const roles = await p.listRoles();
    // Fallback na BASELINE_MOODLE_ROLES (8 archetypes).
    expect(roles.length).toBeGreaterThanOrEqual(7);
    expect(roles.find((r) => r.id === "manager")).toBeDefined();
    expect(roles.find((r) => r.id === "student")).toBeDefined();
  });

  it("WS happy path zwraca dynamiczne role z core_role_get_roles", async () => {
    fetchHandlers.push(() => [
      { id: 1, name: "Menedżer", shortname: "manager" },
      { id: 3, name: "Nauczyciel", shortname: "editingteacher" },
      { id: 99, name: "Custom Tutor", shortname: "tutor" },
    ]);

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const roles = await p.listRoles();
    expect(roles.map((r) => r.id).sort()).toEqual(
      ["editingteacher", "manager", "tutor"].sort(),
    );
  });

  it("DB query exception → WS fallback", async () => {
    process.env.MOODLE_DB_URL = "mysql://stub";
    dbThrowOnce = new Error("connection refused");
    fetchHandlers.push(() => [
      { id: 5, name: "Student", shortname: "student" },
    ]);

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const roles = await p.listRoles();
    expect(roles.find((r) => r.id === "student")).toBeDefined();
  });
});

describe("moodle provider — assignUserRole", () => {
  it("wywołuje core_role_assign_roles z poprawnymi paramami", async () => {
    // Najpierw findUser → core_user_get_users_by_field → []
    // potem create user → core_user_create_users
    // potem listRoles via WS → mapowanie shortname → id
    // potem brak unassigna (user nowy)
    // potem core_role_assign_roles
    fetchHandlers = [
      // findUser (pre-create lookup)
      () => [],
      // create user
      () => [{ id: 100, username: "user@example.com" }],
      // listRoles via WS (po create, przy assign)
      () => [
        { id: 1, name: "Menedżer", shortname: "manager" },
        { id: 5, name: "Student", shortname: "student" },
      ],
      // assign roles
      () => null,
    ];

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    await p.assignUserRole({
      email: "user@example.com",
      displayName: "User Example",
      roleId: "student",
    });

    const assignCall = fetchCalls.find((c) =>
      /wsfunction=core_role_assign_roles/.test(c.body),
    );
    expect(assignCall).toBeDefined();
    // Sprawdzamy że roleid=5 + userid=100 + contextid=1 (system context).
    expect(assignCall?.body).toMatch(/assignments%5B0%5D%5Broleid%5D=5/);
    expect(assignCall?.body).toMatch(/assignments%5B0%5D%5Buserid%5D=100/);
    expect(assignCall?.body).toMatch(/assignments%5B0%5D%5Bcontextid%5D=1/);
  });

  it("rzuca gdy roleId nieznany", async () => {
    fetchHandlers = [
      // findUser
      () => [{ id: 50, email: "u@e", username: "u@e", roles: [] }],
      // listRoles → empty
      () => [],
    ];

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    await expect(
      p.assignUserRole({
        email: "u@e",
        displayName: "U",
        roleId: "non_existent_role",
      }),
    ).rejects.toThrow(/nie istnieje/);
  });

  it("zdejmuje istniejące zarządzane role przy zmianie", async () => {
    // user już ma rolę 'student', chcemy mu dać 'editingteacher'.
    // Powinniśmy zobaczyć core_role_unassign_roles dla student.
    fetchHandlers = [
      // findUser → existing
      () => [
        {
          id: 50,
          email: "u@e",
          username: "u@e",
          roles: [{ shortname: "student" }],
        },
      ],
      // listRoles via WS
      () => [
        { id: 3, name: "Editing", shortname: "editingteacher" },
        { id: 5, name: "Student", shortname: "student" },
      ],
      // unassign student
      () => null,
      // assign editingteacher
      () => null,
    ];

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    await p.assignUserRole({
      email: "u@e",
      displayName: "U",
      roleId: "editingteacher",
    });

    const unassignCall = fetchCalls.find((c) =>
      /wsfunction=core_role_unassign_roles/.test(c.body),
    );
    expect(unassignCall).toBeDefined();
    expect(unassignCall?.body).toMatch(/roleid%5D=5/);
  });

  it("no-op assign gdy user już ma desired role", async () => {
    fetchHandlers = [
      () => [
        {
          id: 50,
          email: "u@e",
          username: "u@e",
          roles: [{ shortname: "student" }],
        },
      ],
      () => [
        { id: 5, name: "Student", shortname: "student" },
      ],
    ];

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    await p.assignUserRole({
      email: "u@e",
      displayName: "U",
      roleId: "student",
    });
    // Nie powinno wywołać assign_roles.
    expect(
      fetchCalls.some((c) => /wsfunction=core_role_assign_roles/.test(c.body)),
    ).toBe(false);
  });
});

describe("moodle provider — listUserEmails (DB direct)", () => {
  it("preferuje DB gdy skonfigurowane", async () => {
    process.env.MOODLE_DB_URL = "mysql://stub";
    dbQueryQueue.push([
      { email: "Alice@Example.com" },
      { email: "BOB@example.com" },
    ]);

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const emails = await p.listUserEmails();
    expect(emails).toEqual(["alice@example.com", "bob@example.com"]);
    expect(fetchCalls).toHaveLength(0);
  });

  it("WS fallback: zwraca lowercase emails z auth=oidc filter", async () => {
    fetchHandlers.push(() => [
      { id: 1, email: "FOO@x.com", username: "foo" },
      { id: 2, email: "Bar@y.com", username: "bar" },
    ]);

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const emails = await p.listUserEmails();
    expect(emails).toEqual(["foo@x.com", "bar@y.com"]);
    // criteria[0][key]=auth, criteria[0][value]=oidc w body
    expect(fetchCalls[0].body).toMatch(/criteria%5B0%5D%5Bkey%5D=auth/);
    expect(fetchCalls[0].body).toMatch(/criteria%5B0%5D%5Bvalue%5D=oidc/);
  });

  it("WS fallback: zwraca null gdy fetch rzuci", async () => {
    fetchHandlers.push(() => {
      throw new Error("network");
    });
    // Powyższe nie zadziała bo handler jest sync — symulujmy przez ok=false.
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof fetch;

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const emails = await p.listUserEmails();
    expect(emails).toBeNull();
  });

  it("WS odpowiedź { users: [...] } też jest akceptowana", async () => {
    fetchHandlers.push(() => ({
      users: [
        { id: 1, email: "a@b.com", username: "a" },
        { id: 2, email: "c@d.com", username: "c" },
      ],
    }));

    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    const emails = await p.listUserEmails();
    expect(emails).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("moodle provider — config + capabilities", () => {
  it("isConfigured: true gdy URL+TOKEN obecne", async () => {
    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    expect(new MoodleProvider().isConfigured()).toBe(true);
  });

  it("isConfigured: false gdy brak tokenu", async () => {
    delete process.env.MOODLE_API_TOKEN;
    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    expect(new MoodleProvider().isConfigured()).toBe(false);
  });

  it("supportsCustomRoles: false (wymaga local_mpkc_sync plugin)", async () => {
    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    expect(p.supportsCustomRoles()).toBe(false);
    // FIX (faza-6 follow-up): create/update/deleteRole są teraz async
    // (poprzednio rzucały synchronicznie, co naruszało interfejs Promise-based
    // PermissionProvider). Caller bez try/catch dostaje rejected Promise,
    // nie unhandled exception.
    await expect(p.createRole()).rejects.toThrow(/local_mpkc_sync/);
    await expect(p.updateRole()).rejects.toThrow(/local_mpkc_sync/);
    await expect(p.deleteRole()).rejects.toThrow(/local_mpkc_sync/);
  });

  it("getUserRole zwraca shortname o najwyższym priorytecie", async () => {
    fetchHandlers.push(() => [
      {
        id: 1,
        email: "u@e",
        username: "u@e",
        roles: [{ shortname: "student" }, { shortname: "manager" }],
      },
    ]);
    const { MoodleProvider } = await import(
      "@/lib/permissions/providers/moodle"
    );
    const p = new MoodleProvider();
    expect(await p.getUserRole("u@e")).toBe("manager");
  });
});

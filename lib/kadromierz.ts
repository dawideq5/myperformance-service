/**
 * Thin client for the Kadromierz REST API (docs: https://docs.kadro.dev/api).
 *
 * The official docs don't spell out the exact auth header format, so we try a
 * short cascade — Authorization: Bearer, then Authorization plain, then X-Api-Key.
 * The first response that isn't a 401/403 wins. The working header name is
 * cached in-memory per key so we don't repeat the probe on every call.
 */

const DEFAULT_BASE_URL = "https://api.kadromierz.pl/api";

export interface KadromierzCurrentUser {
  user: {
    id: number | string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    role?: string;
    company_id?: number | string;
    employment_conditions?: {
      weekly_working_minutes?: number;
      max_daily_working_minutes?: number;
      hire_date?: string;
      release_date?: string | null;
    };
    locations?: Array<{ id: number | string; name?: string }>;
    contracts?: Array<Record<string, unknown>>;
    avatar?: { url?: string } | null;
  };
}

export interface KadromierzEmployee {
  id: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_id?: number | string;
  [key: string]: unknown;
}

export interface KadromierzScheduleShift {
  id: number | string;
  date: string;
  start: string;
  end: string;
  employee_id?: number | string;
  location_id?: number | string;
  position?: string;
  // Kadromierz returns additional fields we don't model — keep them accessible.
  [key: string]: unknown;
}

export interface KadromierzAttendance {
  id: number | string;
  started_at?: string;
  ended_at?: string | null;
  breaks?: Array<{
    id: number | string;
    started_at?: string;
    ended_at?: string | null;
  }>;
  [key: string]: unknown;
}

type AuthHeaderKind = "bearer" | "authorization" | "apikey";

const authCache = new Map<string, AuthHeaderKind>();

function headersFor(kind: AuthHeaderKind, apiKey: string): HeadersInit {
  switch (kind) {
    case "bearer":
      return { Authorization: `Bearer ${apiKey}` };
    case "authorization":
      return { Authorization: apiKey };
    case "apikey":
      return { "X-Api-Key": apiKey };
  }
}

export class KadromierzError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "KadromierzError";
  }
}

function getBaseUrl(): string {
  const raw = process.env.KADROMIERZ_API_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : DEFAULT_BASE_URL;
}

async function requestWithAuth(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const cached = authCache.get(apiKey);
  const kinds: AuthHeaderKind[] = cached
    ? [cached]
    : ["bearer", "authorization", "apikey"];

  let lastResp: Response | null = null;
  for (const kind of kinds) {
    const resp = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...headersFor(kind, apiKey),
        ...(init?.headers ?? {}),
      },
    });
    if (resp.status !== 401 && resp.status !== 403) {
      authCache.set(apiKey, kind);
      return resp;
    }
    lastResp = resp;
  }
  return lastResp as Response;
}

async function request<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await requestWithAuth(apiKey, path, init);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new KadromierzError(
      resp.status,
      `Kadromierz ${resp.status}: ${path}`,
      body,
    );
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const kadromierz = {
  async verifyKey(apiKey: string): Promise<KadromierzCurrentUser> {
    return request<KadromierzCurrentUser>(apiKey, "/users/current");
  },

  async getCurrentUser(apiKey: string): Promise<KadromierzCurrentUser> {
    return request<KadromierzCurrentUser>(apiKey, "/users/current");
  },

  /**
   * Searches the company roster for an employee matching the given email.
   * Uses the master (company owner) API key — tries a few documented-ish
   * endpoints because Kadromierz docs don't spell out a single search path.
   * Returns null when no match is found across all probes.
   */
  async findEmployeeByEmail(
    masterKey: string,
    companyId: string | number,
    email: string,
  ): Promise<KadromierzEmployee | null> {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;

    const candidates: string[] = [
      `/companies/${companyId}/users`,
      `/companies/${companyId}/employees`,
      `/users?email=${encodeURIComponent(needle)}`,
    ];

    for (const path of candidates) {
      try {
        const data = await request<
          | { users?: KadromierzEmployee[]; employees?: KadromierzEmployee[] }
          | KadromierzEmployee[]
        >(masterKey, path);
        const list: KadromierzEmployee[] = Array.isArray(data)
          ? data
          : (data.users ?? data.employees ?? []);
        const match = list.find(
          (e) => typeof e.email === "string" && e.email.toLowerCase() === needle,
        );
        if (match) return match;
      } catch (err) {
        if (err instanceof KadromierzError && err.status === 404) continue;
        throw err;
      }
    }
    return null;
  },

  async getSchedule(params: {
    apiKey: string;
    from: string;
    to: string;
    employeeId?: string | number;
  }): Promise<{ shifts: KadromierzScheduleShift[] }> {
    const search = new URLSearchParams({
      from: params.from,
      to: params.to,
    });
    if (params.employeeId) {
      search.set("employees", String(params.employeeId));
    }
    const data = await request<
      { shifts?: KadromierzScheduleShift[] } | KadromierzScheduleShift[]
    >(params.apiKey, `/schedule?${search.toString()}`);
    if (Array.isArray(data)) return { shifts: data };
    return { shifts: data.shifts ?? [] };
  },

  async clockIn(apiKey: string): Promise<KadromierzAttendance> {
    const data = await request<
      { attendance?: KadromierzAttendance } | KadromierzAttendance
    >(apiKey, "/users/current/attendances/open", { method: "POST", body: "{}" });
    return (data as any).attendance ?? (data as KadromierzAttendance);
  },

  async clockOut(
    apiKey: string,
    attendanceId: string | number,
  ): Promise<KadromierzAttendance> {
    const data = await request<
      { attendance?: KadromierzAttendance } | KadromierzAttendance
    >(apiKey, `/users/current/attendances/${attendanceId}/close`, {
      method: "POST",
      body: "{}",
    });
    return (data as any).attendance ?? (data as KadromierzAttendance);
  },

  async startBreak(
    apiKey: string,
    attendanceId: string | number,
  ): Promise<KadromierzAttendance> {
    const data = await request<
      { attendance?: KadromierzAttendance } | KadromierzAttendance
    >(apiKey, `/users/current/attendances/${attendanceId}/breaks`, {
      method: "POST",
      body: "{}",
    });
    return (data as any).attendance ?? (data as KadromierzAttendance);
  },

  async endBreak(
    apiKey: string,
    attendanceId: string | number,
    breakId: string | number,
  ): Promise<KadromierzAttendance> {
    const data = await request<
      { attendance?: KadromierzAttendance } | KadromierzAttendance
    >(
      apiKey,
      `/users/current/attendances/${attendanceId}/breaks/${breakId}`,
      { method: "POST", body: "{}" },
    );
    return (data as any).attendance ?? (data as KadromierzAttendance);
  },

  /**
   * Find the attendance that's currently open (started, not ended) for the
   * authenticated user. The docs expose /companies/{companyId}/attendances
   * with a date range — we scan today, filter by ended_at=null.
   */
  async getOpenAttendance(
    apiKey: string,
    companyId: string | number,
  ): Promise<KadromierzAttendance | null> {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = from;
    try {
      const data = await request<
        { attendances?: KadromierzAttendance[] } | KadromierzAttendance[]
      >(apiKey, `/companies/${companyId}/attendances?from=${from}&to=${to}`);
      const list = Array.isArray(data) ? data : (data.attendances ?? []);
      return list.find((a) => !a.ended_at) ?? null;
    } catch (err) {
      if (err instanceof KadromierzError && err.status === 404) return null;
      throw err;
    }
  },
};

export function todayScheduleWindow(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

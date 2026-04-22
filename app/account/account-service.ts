import { api } from "@/lib/api-client";
import type {
  CalendarEvent,
  GoogleStatus,
  KadromierzStatus,
  KeycloakSession,
  MoodleStatus,
  RequiredAction,
  TwoFAStatus,
  UserProfile,
  WebAuthnKey,
} from "./types";

export interface KadromierzAttendanceBreak {
  id: number | string;
  started_at?: string;
  ended_at?: string | null;
}

export interface KadromierzAttendance {
  id: number | string;
  started_at?: string;
  ended_at?: string | null;
  breaks?: KadromierzAttendanceBreak[];
}

export interface KadromierzShift {
  id: number | string;
  date: string;
  start: string;
  end: string;
  position?: string;
  location_id?: number | string;
}

interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  attributes?: Record<string, string[] | undefined>;
}

export const accountService = {
  getProfile: () => api.get<UserProfile>("/api/account"),

  updateProfile: (payload: ProfileUpdatePayload) =>
    api.put<UserProfile, ProfileUpdatePayload>("/api/account", payload),

  getSessions: () => api.get<KeycloakSession[]>("/api/account/sessions"),

  deleteSession: (id: string) =>
    api.delete<void>(`/api/account/sessions/${encodeURIComponent(id)}`),

  get2FA: () => api.get<TwoFAStatus>("/api/account/2fa"),

  generateTOTP: () =>
    api.post<
      { qrCode: string; secret: string; otpauthUri: string },
      { action: "generate" }
    >("/api/account/2fa", { action: "generate" }),

  verifyTOTP: (payload: { secret: string; totpCode: string }) =>
    api.post<
      { success: boolean; enabled: boolean },
      { action: "verify"; secret: string; totpCode: string }
    >("/api/account/2fa", { action: "verify", ...payload }),

  deleteTOTP: () => api.delete<unknown>("/api/account/2fa"),

  getWebAuthnKeys: () => api.get<{ keys: WebAuthnKey[] }>("/api/account/webauthn"),

  getWebAuthnOptions: (attachment?: "platform" | "cross-platform") =>
    api.post<
      {
        options: {
          challenge: string;
          rp: { name: string; id?: string };
          user: { id: string; name: string; displayName: string };
          pubKeyCredParams: { alg: number; type: string }[];
          timeout: number;
          attestation: string;
          authenticatorSelection: Record<string, unknown>;
          extensions?: Record<string, unknown>;
        };
        challenge: string;
      },
      { action: "get-options"; attachment?: "platform" | "cross-platform" }
    >("/api/account/webauthn", { action: "get-options", attachment }),

  registerWebAuthn: (payload: {
    credential: {
      id: string;
      attestationObject: string;
      clientDataJSON: string;
      publicKey?: string;
      transports?: string[];
    };
    label: string;
    attachment?: "platform" | "cross-platform";
  }) =>
    api.post<
      { success: boolean },
      {
        action: "register";
        credential: typeof payload.credential;
        label: string;
        attachment?: "platform" | "cross-platform";
      }
    >("/api/account/webauthn", { action: "register", ...payload }),

  deleteWebAuthnKey: (credentialId: string) =>
    api.delete<unknown>(
      `/api/account/webauthn?id=${encodeURIComponent(credentialId)}`,
    ),

  renameWebAuthnKey: (payload: { credentialId: string; newName: string }) =>
    api.put<unknown, typeof payload>("/api/account/webauthn", payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    api.post<unknown, typeof payload>("/api/account/password", payload),

  setRequiredAction: (action: RequiredAction) =>
    api.post<unknown, { action: RequiredAction }>(
      "/api/account/required-actions",
      { action },
    ),

  cancelRequiredAction: (action: RequiredAction) =>
    api.delete<unknown>(
      `/api/account/required-actions?action=${encodeURIComponent(action)}`,
    ),
};

export const moodleService = {
  getStatus: () => api.get<MoodleStatus>("/api/integrations/moodle/status"),
  getEvents: () =>
    api.get<{ events: CalendarEvent[] }>("/api/integrations/moodle/events"),
  disconnect: () =>
    api.post<{ ok: boolean; connected: boolean }>(
      "/api/integrations/moodle/disconnect",
    ),
  reconnect: () =>
    api.post<{ ok: boolean; connected: boolean }>(
      "/api/integrations/moodle/reconnect",
    ),
};

export const googleService = {
  getStatus: () => api.get<GoogleStatus>("/api/integrations/google/status"),

  saveFeatures: (features: string[]) =>
    api.post<unknown, { features: string[] }>(
      "/api/integrations/google/connect",
      { features },
    ),

  disconnect: () =>
    api.post<unknown>("/api/integrations/google/disconnect"),

  provision: () =>
    api.post<{
      emailVerified?: { ok: boolean; error?: string };
      calendar?: { ok: boolean; error?: string; id?: string };
      requestedFeatures?: string[];
      googleEmail?: string;
      keycloakEmail?: string;
    }>("/api/integrations/google/provision"),
};

export const kadromierzService = {
  getStatus: () =>
    api.get<KadromierzStatus>("/api/integrations/kadromierz/status"),

  connect: (apiKey?: string) =>
    api.post<KadromierzStatus, { apiKey?: string }>(
      "/api/integrations/kadromierz/connect",
      apiKey ? { apiKey } : {},
    ),

  disconnect: () =>
    api.post<{ ok: boolean }>("/api/integrations/kadromierz/disconnect"),

  getSchedule: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ shifts: KadromierzShift[] }>(
      `/api/integrations/kadromierz/schedule${suffix}`,
    );
  },

  getAttendance: () =>
    api.get<{ attendance: KadromierzAttendance | null }>(
      "/api/integrations/kadromierz/attendance",
    ),

  start: () =>
    api.post<
      { attendance: KadromierzAttendance },
      { action: "start" }
    >("/api/integrations/kadromierz/attendance", { action: "start" }),

  end: (attendanceId: string | number) =>
    api.post<
      { attendance: KadromierzAttendance },
      { action: "end"; attendanceId: string | number }
    >("/api/integrations/kadromierz/attendance", {
      action: "end",
      attendanceId,
    }),

  startBreak: (attendanceId: string | number) =>
    api.post<
      { attendance: KadromierzAttendance },
      { action: "break_start"; attendanceId: string | number }
    >("/api/integrations/kadromierz/attendance", {
      action: "break_start",
      attendanceId,
    }),

  endBreak: (attendanceId: string | number, breakId: string | number) =>
    api.post<
      { attendance: KadromierzAttendance },
      {
        action: "break_end";
        attendanceId: string | number;
        breakId: string | number;
      }
    >("/api/integrations/kadromierz/attendance", {
      action: "break_end",
      attendanceId,
      breakId,
    }),
};

export interface AdminUserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number | null;
  requiredActions: string[];
}

export interface AdminUserSession {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
  expires: number;
  clients?: Record<string, string>;
}

export interface AdminUserListResponse {
  users: AdminUserSummary[];
  total: number;
  first: number;
  max: number;
}

export interface AdminRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  assigned: boolean;
}

export interface AdminIntegrationStatus {
  google: {
    connected: boolean;
    userId: string | null;
    username: string | null;
  };
  kadromierz: {
    connected: boolean;
    companyId: string | null;
    employeeId: string | null;
    connectedAt: string | null;
  };
}

export const adminUserService = {
  list: (params?: { search?: string; first?: number; max?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.first !== undefined) qs.set("first", String(params.first));
    if (params?.max !== undefined) qs.set("max", String(params.max));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<AdminUserListResponse>(`/api/admin/users${suffix}`);
  },

  invite: (payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    actions?: string[];
    sendEmail?: boolean;
  }) =>
    api.post<{ id: string; email: string; invited: boolean }, typeof payload>(
      "/api/admin/users",
      payload,
    ),

  get: (id: string) =>
    api.get<AdminUserSummary & { attributes: Record<string, string[]> }>(
      `/api/admin/users/${encodeURIComponent(id)}`,
    ),

  update: (
    id: string,
    payload: {
      enabled?: boolean;
      firstName?: string;
      lastName?: string;
      email?: string;
    },
  ) =>
    api.put<{ ok: boolean }, typeof payload>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      payload,
    ),

  remove: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`),

  sessions: (id: string) =>
    api.get<{ sessions: AdminUserSession[] }>(
      `/api/admin/users/${encodeURIComponent(id)}/sessions`,
    ),

  logoutAll: (id: string) =>
    api.delete<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(id)}/sessions`,
    ),

  sendActions: (
    id: string,
    payload: { actions: string[]; sendEmail?: boolean },
  ) =>
    api.post<{ sent: boolean; queued?: boolean }, typeof payload>(
      `/api/admin/users/${encodeURIComponent(id)}/actions`,
      payload,
    ),

  resetPassword: (
    id: string,
    payload: { password?: string; temporary?: boolean; sendEmail?: boolean },
  ) =>
    api.post<{ sent?: boolean; ok?: boolean }, typeof payload>(
      `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
      payload,
    ),

  listRoles: (id: string) =>
    api.get<{ roles: AdminRole[] }>(
      `/api/admin/users/${encodeURIComponent(id)}/roles`,
    ),

  updateRoles: (id: string, payload: { add?: string[]; remove?: string[] }) =>
    api.post<{ ok: boolean }, typeof payload>(
      `/api/admin/users/${encodeURIComponent(id)}/roles`,
      payload,
    ),

  getIntegrations: (id: string) =>
    api.get<AdminIntegrationStatus>(
      `/api/admin/users/${encodeURIComponent(id)}/integrations`,
    ),

  unlinkIntegration: (id: string, provider: "google" | "kadromierz") =>
    api.delete<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(id)}/integrations?provider=${provider}`,
    ),

  getLockStatus: (id: string) =>
    api.get<{
      numFailures: number;
      disabled: boolean;
      lastFailure: number | null;
      lastIPFailure: string | null;
    }>(`/api/admin/users/${encodeURIComponent(id)}/unlock`),

  unlock: (id: string) =>
    api.post<{ ok: boolean }>(
      `/api/admin/users/${encodeURIComponent(id)}/unlock`,
    ),

  listAreaAssignments: (id: string) =>
    api.get<{ assignments: Array<{ areaId: string; roleName: string | null }> }>(
      `/api/admin/users/${encodeURIComponent(id)}/area-role`,
    ),

  setAreaRole: (
    id: string,
    payload: { areaId: string; roleName: string | null },
  ) =>
    api.post<
      {
        result: {
          areaId: string;
          removed: string[];
          added: string[];
          nativeSync: "ok" | "skipped" | "failed";
          nativeError?: string;
        };
      },
      typeof payload
    >(`/api/admin/users/${encodeURIComponent(id)}/area-role`, payload),
};

// ---------------------------------------------------------------------------
// Permission areas — registry of app integrations + per-area RBAC
// ---------------------------------------------------------------------------

export interface AreaSummarySeedRole {
  name: string;
  description: string;
  priority: number;
  nativeRoleId: string | null;
  userCount: number;
}

export interface AreaSummary {
  id: string;
  label: string;
  description: string;
  icon: string | null;
  provider: "keycloak-only" | "native";
  nativeProviderId: string | null;
  nativeConfigured: boolean;
  supportsCustomRoles: boolean;
  seedRoles: AreaSummarySeedRole[];
  totalAssignedUsers: number;
}

export interface AreaDetailRole {
  kcRoleName: string;
  kcRoleId: string;
  description: string;
  priority: number;
  isSeeded: boolean;
  isCustom: boolean;
  userCount: number;
  native: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    systemDefined: boolean;
    userCount: number | null;
  } | null;
}

export interface AreaDetailNativePermission {
  key: string;
  label: string;
  group: string;
  description?: string;
}

export interface AreaDetail {
  area: {
    id: string;
    label: string;
    description: string;
    icon: string | null;
    provider: "keycloak-only" | "native";
    nativeProviderId: string | null;
    nativeConfigured: boolean;
    supportsCustomRoles: boolean;
  };
  roles: AreaDetailRole[];
  orphanNativeRoles: Array<{
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    systemDefined: boolean;
    userCount: number | null;
  }>;
  nativePermissions: AreaDetailNativePermission[];
}

export const permissionAreaService = {
  list: () => api.get<{ areas: AreaSummary[] }>("/api/admin/areas"),

  detail: (id: string) =>
    api.get<AreaDetail>(`/api/admin/areas/${encodeURIComponent(id)}`),

  createRole: (
    id: string,
    payload: { name: string; description?: string; permissions: string[] },
  ) =>
    api.post<
      {
        role: {
          kcRoleName: string;
          kcRoleId: string;
          nativeRoleId: string | null;
          description: string;
        };
      },
      typeof payload
    >(`/api/admin/areas/${encodeURIComponent(id)}/roles`, payload),

  updateRole: (
    id: string,
    roleId: string,
    payload: { name?: string; description?: string; permissions?: string[] },
  ) =>
    api.patch<{ ok: boolean; isSeed: boolean }, typeof payload>(
      `/api/admin/areas/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`,
      payload,
    ),

  deleteRole: (id: string, roleId: string) =>
    api.delete<{ ok: boolean }>(
      `/api/admin/areas/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`,
    ),

  bulkAssign: (payload: {
    userIds: string[];
    areaId: string;
    roleName: string | null;
  }) =>
    api.post<
      {
        total: number;
        ok: number;
        failed: number;
        results: Array<
          | {
              userId: string;
              status: "ok";
              areaId: string;
              removed: string[];
              added: string[];
              nativeSync: "ok" | "skipped" | "failed";
              nativeError?: string;
            }
          | { userId: string; status: "failed"; error: string }
        >;
      },
      typeof payload
    >("/api/admin/bulk/area-role", payload),

  reset: (id: string) =>
    api.post<
      {
        areaId: string;
        seedCount: number;
        results: Array<{
          name: string;
          action: "created" | "updated" | "ok";
        }>;
      },
      Record<string, never>
    >(`/api/admin/areas/${encodeURIComponent(id)}/reset`, {}),
};


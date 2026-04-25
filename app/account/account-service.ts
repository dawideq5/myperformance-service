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
  getEvents: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set("from", range.from);
    if (range?.to) qs.set("to", range.to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ events: CalendarEvent[] }>(
      `/api/integrations/moodle/events${suffix}`,
    );
  },
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
  list: (params?: { search?: string; first?: number; max?: number; role?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.first !== undefined) qs.set("first", String(params.first));
    if (params?.max !== undefined) qs.set("max", String(params.max));
    if (params?.role) qs.set("role", params.role);
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
    areaRoles?: Array<{ areaId: string; roleName: string | null }>;
  }) =>
    api.post<
      {
        id: string;
        email: string;
        invited: boolean;
        roleAssignmentErrors: Array<{ areaId: string; error: string }>;
      },
      typeof payload
    >("/api/admin/users", payload),

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
      emailVerified?: boolean;
      attributes?: Record<string, string[] | null>;
    },
  ) =>
    api.put<{ ok: boolean }, typeof payload>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      payload,
    ),

  listEvents: (id: string, max = 50) =>
    api.get<{
      events: Array<{
        kind: "user" | "admin";
        type: string;
        time: number | null;
        clientId: string | null;
        ipAddress: string | null;
        error: string | null;
        details: Record<string, unknown>;
      }>;
    }>(
      `/api/admin/users/${encodeURIComponent(id)}/events?max=${max}`,
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

  removeAction: (id: string, action: string) =>
    api.delete<{ removed: string }>(
      `/api/admin/users/${encodeURIComponent(id)}/actions?action=${encodeURIComponent(action)}`,
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

export interface AreaRole {
  /** Realm role name — np. `chatwoot_admin`. */
  name: string;
  /** Pretty PL label — np. `Administrator`. */
  label: string;
  description: string;
  priority: number;
  nativeRoleId: string | null;
  /** `true` = zadeklarowana w `areas.ts`; `false` = dynamicznie wykryta z providera. */
  seed: boolean;
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
  dynamicRoles: boolean;
  nativeAdminUrl: string | null;
  /** Wszystkie env vars potrzebne do skonfigurowania providera. */
  requiredEnv?: string[];
  /** Env vars które aktualnie nie są ustawione (podzbiór requiredEnv). */
  missingEnv?: string[];
  roles: AreaRole[];
  totalAssignedUsers: number;
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
    dynamicRoles: boolean;
    nativeAdminUrl: string | null;
  };
  roles: AreaRole[];
  nativePermissions: AreaDetailNativePermission[];
}

export const permissionAreaService = {
  list: () => api.get<{ areas: AreaSummary[] }>("/api/admin/areas"),

  detail: (id: string) =>
    api.get<AreaDetail>(`/api/admin/areas/${encodeURIComponent(id)}`),

  syncKc: (opts?: { deleteStale?: boolean }) =>
    api.post<
      {
        rolesCreated: number;
        rolesUpdated: number;
        rolesDeleted: number;
        groupsCreated: number;
        groupsUpdated: number;
        errors: Array<{ step: string; name: string; error: string }>;
      },
      { deleteStale?: boolean }
    >("/api/admin/iam/sync-kc", opts ?? {}),

  migrateLegacyRoles: (opts?: {
    deleteLegacy?: boolean;
    userId?: string;
    limit?: number;
  }) =>
    api.post<
      {
        totalUsers: number;
        migratedUsers: number;
        errors: Array<{ userId: string; error: string }>;
        deletedLegacyRoles: string[];
        results: Array<{
          userId: string;
          username: string;
          email: string | null;
          migrated: Array<{
            from: string;
            to: string | null;
            areaId: string | null;
            status: "ok" | "skipped" | "failed";
            error?: string;
          }>;
        }>;
      },
      { deleteLegacy?: boolean; userId?: string; limit?: number }
    >("/api/admin/iam/migrate-legacy-roles", opts ?? {}),

  resyncProfiles: (opts?: { userId?: string; limit?: number }) =>
    api.post<
      {
        totalUsers: number;
        ok: number;
        failed: number;
        perUser: Array<{
          userId: string;
          username: string;
          email: string | null;
          results: Array<{
            areaId: string;
            status: "ok" | "skipped" | "failed";
            error?: string;
          }>;
        }>;
      },
      { userId?: string; limit?: number }
    >("/api/admin/iam/resync-profiles", opts ?? {}),

  diagnoseProvider: (providerId: string, email?: string) => {
    const qs = email ? `?email=${encodeURIComponent(email)}` : "";
    return api.get<{
      providerId: string;
      label: string;
      configured: boolean;
      supportsCustomRoles: boolean;
      roles:
        | Array<{ id: string; name: string; userCount: number | null }>
        | null;
      rolesError?: string;
      userLookup?: {
        email: string;
        found: boolean;
        currentRole: string | null;
        error?: string;
      };
    }>(
      `/api/admin/iam/diagnostics/${encodeURIComponent(providerId)}${qs}`,
    );
  },

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
};

// ---------------------------------------------------------------------------
// Admin groups — Keycloak groups CRUD + member management
// ---------------------------------------------------------------------------

export interface AdminGroupMember {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  realmRoles: string[];
  memberCount: number;
  members: AdminGroupMember[];
}

export const adminGroupService = {
  list: () => api.get<{ groups: AdminGroup[] }>("/api/admin/groups"),

  create: (payload: { name: string; description?: string; realmRoles?: string[] }) =>
    api.post<{ id: string; name: string }, typeof payload>("/api/admin/groups", payload),

  update: (id: string, payload: { name?: string; description?: string }) =>
    api.put<{ ok: true }, typeof payload>(
      `/api/admin/groups/${encodeURIComponent(id)}`,
      payload,
    ),

  remove: (id: string) =>
    api.delete<{ ok: true }>(`/api/admin/groups/${encodeURIComponent(id)}`),

  setRoles: (id: string, realmRoles: string[]) =>
    api.post<
      { ok: true; added: string[]; removed: string[] },
      { realmRoles: string[] }
    >(`/api/admin/groups/${encodeURIComponent(id)}/roles`, { realmRoles }),

  addMember: (groupId: string, userId: string) =>
    api.put<{ ok: true }, Record<string, never>>(
      `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      {},
    ),

  removeMember: (groupId: string, userId: string) =>
    api.delete<{ ok: true }>(
      `/api/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    ),

  bulkAssign: (payload: { userIds: string[]; groupId: string; replace?: boolean }) =>
    api.post<
      {
        total: number;
        ok: number;
        failed: number;
        results: Array<
          | { userId: string; status: "ok"; removedGroups: string[] }
          | { userId: string; status: "failed"; error: string }
        >;
      },
      typeof payload
    >("/api/admin/bulk/group", payload),
};

// ---------------------------------------------------------------------------
// Documenso multi-org membership
// ---------------------------------------------------------------------------

export interface DocumensoTeamRow {
  id: number;
  name: string;
  url: string;
  organisationId: string;
}

export interface DocumensoOrganisation {
  id: string;
  name: string;
  type: "PERSONAL" | "ORGANISATION";
  teams: DocumensoTeamRow[];
}

export interface DocumensoMembership {
  organisationId: string;
  organisationName: string;
  organisationRole: "ADMIN" | "MANAGER" | "MEMBER" | null;
}

export const documensoCatalogService = {
  list: () => api.get<{ organisations: DocumensoOrganisation[] }>("/api/admin/documenso/orgs"),
};

export const chatwootCatalogService = {
  list: () => api.get<{ inboxes: ChatwootInbox[] }>("/api/admin/chatwoot/inboxes"),
};

export const moodleCatalogService = {
  list: () => api.get<{ courses: MoodleCourseRow[] }>("/api/admin/moodle/courses"),
};

export const documensoMembershipService = {
  list: (userId: string) =>
    api.get<{
      allOrganisations: DocumensoOrganisation[];
      memberships: DocumensoMembership[];
      documensoUserId: number | null;
      userEmail: string | null;
    }>(`/api/admin/users/${encodeURIComponent(userId)}/documenso`),

  add: (userId: string, organisationId: string, role?: "ADMIN" | "MANAGER" | "MEMBER") =>
    api.post<
      { ok: true },
      { action: "add"; organisationId: string; organisationRole?: typeof role }
    >(`/api/admin/users/${encodeURIComponent(userId)}/documenso`, {
      action: "add",
      organisationId,
      ...(role ? { organisationRole: role } : {}),
    }),

  remove: (userId: string, organisationId: string) =>
    api.post<
      { ok: true },
      { action: "remove"; organisationId: string }
    >(`/api/admin/users/${encodeURIComponent(userId)}/documenso`, {
      action: "remove",
      organisationId,
    }),
};

// ── Chatwoot inboxes ────────────────────────────────────────────────────────
export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  account_id: number;
}
export const chatwootInboxService = {
  list: (userId: string) =>
    api.get<{
      allInboxes: ChatwootInbox[];
      assignedInboxIds: number[];
      chatwootUserId: number | null;
      accountRole: number | null;
    }>(`/api/admin/users/${encodeURIComponent(userId)}/chatwoot`),
  add: (userId: string, inboxId: number) =>
    api.post<{ ok: true }, { action: "add"; inboxId: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/chatwoot`,
      { action: "add", inboxId },
    ),
  remove: (userId: string, inboxId: number) =>
    api.post<{ ok: true }, { action: "remove"; inboxId: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/chatwoot`,
      { action: "remove", inboxId },
    ),
};

// ── Moodle courses ──────────────────────────────────────────────────────────
export interface MoodleCourseRow {
  id: number;
  shortname: string;
  fullname: string;
  visible: number;
}
export const moodleCourseService = {
  list: (userId: string) =>
    api.get<{
      allCourses: MoodleCourseRow[];
      enrolledCourseIds: number[];
      moodleUserId: number | null;
    }>(`/api/admin/users/${encodeURIComponent(userId)}/moodle`),
  add: (userId: string, courseId: number) =>
    api.post<{ ok: true }, { action: "add"; courseId: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/moodle`,
      { action: "add", courseId },
    ),
  remove: (userId: string, courseId: number) =>
    api.post<{ ok: true }, { action: "remove"; courseId: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/moodle`,
      { action: "remove", courseId },
    ),
};


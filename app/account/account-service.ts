import { api } from "@/lib/api-client";
import type {
  GoogleStatus,
  KeycloakSession,
  RequiredAction,
  TwoFAStatus,
  UserProfile,
  WebAuthnKey,
} from "./types";

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

  getWebAuthnKeys: () => api.get<{ keys: WebAuthnKey[] }>("/api/account/webauthn"),

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

export interface KeycloakSession {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
  expires: number;
  browser: string;
  current: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
}

export interface TwoFAStatus {
  enabled: boolean;
  configured: boolean;
  qrCode?: string;
  secret?: string;
}

export interface WebAuthnKey {
  id: string;
  credentialId?: string;
  label: string;
  createdDate: number;
}

export interface GoogleStatus {
  connected: boolean;
  provider?: string;
  email?: string;
  scopes?: string[];
  connectedAt?: string | null;
}

export interface KadromierzStatus {
  connected: boolean;
  stale?: boolean;
  reason?: "invalid_key";
  masterKeyConfigured?: boolean;
  mode?: "master" | "manual";
  emailVerified?: boolean;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | number | null;
  employeeId?: string | number | null;
  role?: string | null;
}

export interface MoodleStatus {
  connected: boolean;
  configured?: boolean;
  hasRole?: boolean;
  userDisconnected?: boolean;
  moodleUserId?: number;
  fullname?: string;
  username?: string;
  reason?: "not_provisioned" | "unreachable";
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  source: "manual" | "google" | "kadromierz" | "moodle";
  googleEventId?: string;
  moodleEventId?: number;
  eventtype?: string;
  color?: string;
  location?: string;
  url?: string;
  readOnly?: boolean;
}

export type RequiredAction =
  | "CONFIGURE_TOTP"
  | "WEBAUTHN_REGISTER"
  | "VERIFY_EMAIL"
  | "UPDATE_PASSWORD"
  | "UPDATE_PROFILE";

export type AccountTabId =
  | "profile"
  | "security"
  | "sessions"
  | "integrations"
  | "activity"
  | "preferences";

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

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  source: "manual" | "google";
  googleEventId?: string;
  color?: string;
  location?: string;
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
  | "activity";

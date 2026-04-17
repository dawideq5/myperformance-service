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

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const MIN_PASSWORD_LENGTH = 8;

export const MIDDLEWARE_USERINFO_CACHE_TTL_MS = 30_000;

export const ALLOWED_REQUIRED_ACTIONS = new Set([
  "CONFIGURE_TOTP",
  "WEBAUTHN_REGISTER",
  "VERIFY_EMAIL",
  "UPDATE_PASSWORD",
  "UPDATE_PROFILE",
]);

export const ALLOWED_GOOGLE_FEATURES = new Set([
  "email_verification",
  "calendar",
  "gmail_labels",
]);

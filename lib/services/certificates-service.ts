/**
 * Pure helpers for the admin/certificates UI.
 *
 * Extracted from CertificatesClient.tsx as part of the faza-3 split.
 * Keep this module DOM-free — it must be importable from server tests.
 */

export type BindingEventKind = "created" | "seen" | "denied" | "reset";

export interface LiveBindingEvent {
  kind: BindingEventKind;
  serialNumber: string;
  at: string;
  ip?: string;
  userAgent?: string;
  components?: Record<string, string>;
  diff?: { field: string; before: string; after: string }[];
  actor?: string;
}

export type CaStatus = {
  online: boolean;
  url: string;
  provisioner?: string;
  provisionerType?: string;
  rootNotAfter?: string;
  rootDaysLeft?: number;
  rootSubject?: string;
  error?: string;
};

export type AuditEvent = {
  ts: string;
  actor: string;
  action: string;
  subject?: string;
  ok: boolean;
  error?: string;
};

export interface DeviceBinding {
  serialNumber: string;
  hash: string;
  components: Record<string, string>;
  firstSeenAt: string;
  lastSeenAt: string;
  lastDeniedAt?: string;
  lastDenial?: {
    at: string;
    ip?: string;
    userAgent?: string;
    diff: { field: string; before: string; after: string }[];
  };
}

export interface BindingEventRow {
  id: string;
  ts: string;
  kind: BindingEventKind;
  ip?: string;
  userAgent?: string;
  components?: Record<string, string>;
  diff?: { field: string; before: string; after: string }[];
  actor?: string;
}

export interface IssueResult {
  sent: boolean;
  email: string;
  password: string;
  filename: string;
  notAfter: string;
  serial: string;
  error?: string;
  pkcs12Base64?: string;
}

export interface PanelState {
  role: string;
  label: string;
  domain: string;
  tlsOption: string;
}

export const ROLES = [
  { value: "sprzedawca", label: "Sprzedawca" },
  { value: "serwisant", label: "Serwisant" },
  { value: "kierowca", label: "Kierowca" },
] as const;

export const PRESETS = [30, 90, 365, 730, 1825];

export const BINDING_FIELD_LABELS: Record<string, string> = {
  userAgent: "Przeglądarka (User-Agent)",
  platform: "System operacyjny",
  browserBrand: "Rodzaj przeglądarki",
  acceptLanguage: "Preferowany język",
  mobile: "Tryb mobilny",
};

export const EVENT_LABELS: Record<BindingEventKind, string> = {
  created: "Urządzenie powiązane",
  seen: "Użycie",
  denied: "Nieautoryzowany dostęp",
  reset: "Powiązanie zresetowane",
};

export function eventTone(
  kind: BindingEventKind,
): "success" | "danger" | "neutral" | "warning" {
  switch (kind) {
    case "created":
      return "success";
    case "denied":
      return "danger";
    case "reset":
      return "warning";
    default:
      return "neutral";
  }
}

export function summariseBinding(
  binding: DeviceBinding | null,
): { label: string; tone: "success" | "danger" | "neutral"; hint?: string } {
  if (!binding) {
    return {
      label: "Niepowiązany",
      tone: "neutral",
      hint: "Certyfikat jeszcze nie został użyty — pierwsze poprawne użycie utworzy odcisk urządzenia.",
    };
  }
  if (binding.lastDeniedAt) {
    return {
      label: "Powiązany · nieautoryzowany dostęp",
      tone: "danger",
      hint: `Ostatnia nieautoryzowana próba: ${new Date(binding.lastDeniedAt).toLocaleString("pl-PL")}`,
    };
  }
  return {
    label: "Powiązany",
    tone: "success",
    hint: `Ostatnie użycie: ${new Date(binding.lastSeenAt).toLocaleString("pl-PL")}`,
  };
}

/**
 * Validates the issue-cert form input. Returns null on success or an
 * error message (Polish, ready to display) on failure.
 */
export function validateIssueInput(input: {
  roles: string[];
  validityDays: number;
}): string | null {
  if (input.roles.length === 0) {
    return "Zaznacz co najmniej jedną rolę.";
  }
  if (
    !Number.isFinite(input.validityDays) ||
    input.validityDays < 1 ||
    input.validityDays > 3650
  ) {
    return "Ważność musi być w zakresie 1–3650 dni.";
  }
  return null;
}

/**
 * Decode a base64-encoded PKCS12 blob into a downloadable blob URL.
 * Caller is responsible for calling URL.revokeObjectURL when done.
 *
 * Browser-only — uses atob and Blob.
 */
export function pkcs12ToBlobUrl(base64: string): { url: string; blob: Blob } {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/x-pkcs12" });
  return { url: URL.createObjectURL(blob), blob };
}

export function rootExpiryColorClass(rootDaysLeft: number | undefined): string {
  if (typeof rootDaysLeft !== "number") return "text-[var(--text-muted)]";
  if (rootDaysLeft < 30) return "text-red-400";
  if (rootDaysLeft < 90) return "text-amber-400";
  return "text-[var(--text-muted)]";
}

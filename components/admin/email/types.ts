// Shared TypeScript types for the admin email panel components.
// Extracted from app/admin/email/EmailClient.tsx during faza-3 split.

export type TabId =
  | "start"
  | "templates"
  | "layouts"
  | "smtp"
  | "branding"
  | "postal";

// ── Templates ───────────────────────────────────────────────────────────────

export interface CatalogVariable {
  key: string;
  label: string;
  example: string;
  description: string;
  group: string;
}

export type Editability =
  | "full"
  | "kc-localization"
  | "external-link"
  | "readonly";

export interface TemplateRow {
  actionKey: string;
  category: string;
  app: string;
  appLabel: string;
  name: string;
  description: string;
  editability: Editability;
  externalEditorUrl?: string;
  externalEditorLabel?: string;
  trigger: string;
  variables: CatalogVariable[];
  subject: string;
  body: string;
  enabled: boolean;
  layoutId: string | null;
  smtpConfigId: string | null;
  hasOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SmtpConfigOpt {
  id: string;
  alias: string;
  label: string;
  isDefault: boolean;
}

export interface LayoutOpt {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
}

// ── Layouts ─────────────────────────────────────────────────────────────────

export interface LayoutFull {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

// ── SMTP ────────────────────────────────────────────────────────────────────

export interface SmtpConfigFull {
  id: string;
  alias: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  useTls: boolean;
  fromEmail: string;
  fromDisplay: string | null;
  replyTo: string | null;
  postalServerId: number | null;
  isDefault: boolean;
}

export interface OvhMailboxBrief {
  email: string;
  domain: string;
  state: string;
  isBlocked: boolean;
}

// ── Branding ────────────────────────────────────────────────────────────────

export interface Branding {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  legalName: string | null;
  fromDisplay: string | null;
  replyTo: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

// ── Postal ──────────────────────────────────────────────────────────────────

export interface PostalOrg {
  id: number;
  name: string;
  permalink: string;
  serverCount: number;
}

export interface PostalServer {
  id: number;
  organizationId: number;
  organizationName: string;
  name: string;
  mode: string;
  postmasterAddress: string | null;
}

export interface PostalCred {
  id: number;
  type: string;
  name: string;
  key: string;
}

export interface PostalDomainRow {
  id: number;
  name: string;
  spfStatus: string | null;
  dkimStatus: string | null;
  mxStatus: string | null;
  returnPathStatus: string | null;
}

// ── OVH (kept for OvhPanel even though currently not mounted) ───────────────

export interface OvhConfigUI {
  endpoint: "ovh-eu" | "ovh-us" | "ovh-ca";
  appKey: string | null;
  appSecret: string | null;
  consumerKey: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export interface OvhDomainRow {
  name: string;
  mailboxCount: number;
}

export interface OvhMailbox {
  email: string;
  domain: string;
  size: number;
  description: string | null;
  isBlocked: boolean;
  state: string;
  primaryEmailAddress: string;
}

// ── Slash picker / variable picker ──────────────────────────────────────────

export interface PickerState {
  open: boolean;
  query: string;
  filtered: CatalogVariable[];
  highlightedIdx: number;
}

export const EMPTY_PICKER_STATE: PickerState = {
  open: false,
  query: "",
  filtered: [],
  highlightedIdx: 0,
};

export interface SlashTextareaHandle {
  insertVariable: (v: CatalogVariable) => void;
  insertLiteral: (text: string) => void;
  closePicker: () => void;
  setHighlightedIdx: (idx: number) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  auth: "Autoryzacja",
  calendar: "Kalendarz",
  documents: "Dokumenty",
  support: "Obsługa klienta",
  academy: "Akademia",
  knowledge: "Knowledge",
  system: "System",
};

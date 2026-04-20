export type PanelRole = "sprzedawca" | "serwisant" | "kierowca" | "dokumenty_access";

export interface IssuedCertificate {
  id: string;
  subject: string;
  role: string;
  roles?: PanelRole[];
  email: string;
  serialNumber: string;
  notAfter: string;
  issuedAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

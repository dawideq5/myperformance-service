export type PanelRole = "sprzedawca" | "serwisant" | "kierowca";

export interface IssuedCertificate {
  id: string;
  /** Nazwa urządzenia/komputera (Common Name) — np. "PC-SERWIS-01" */
  subject: string;
  role: string;
  roles?: PanelRole[];
  /** E-mail kontaktowy do dostarczenia pliku .p12 (opcjonalny) */
  email: string;
  serialNumber: string;
  notAfter: string;
  issuedAt: string;
  revokedAt?: string;
  revokedReason?: string;
  /** UUID lokalizacji przypisanej przy wystawieniu (opcjonalne) */
  locationId?: string;
  /** Opis stanowiska lub urządzenia (opcjonalny) */
  description?: string;
}

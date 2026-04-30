import { getOptionalEnv } from "@/lib/env";

/** Email "systemowego signera" wyświetlany przy podpisie pracownika w
 * Documenso. NIE używa prywatnego maila pracownika z KC — zostaje email
 * organizacji żeby nie ujawniać danych zatrudnienia klientowi.
 *
 * Override przez env `SERVICE_SIGNER_EMAIL`. */
export function getServiceSignerEmail(): string {
  return (
    getOptionalEnv("SERVICE_SIGNER_EMAIL").trim() ||
    "caseownia@zlecenieserwisowe.pl"
  );
}

/** Nazwa organizacji wyświetlana w UI/PDF. Domyślnie z NEXT_PUBLIC_BRAND_NAME. */
export function getBrandName(): string {
  return (
    getOptionalEnv("NEXT_PUBLIC_BRAND_NAME").trim() ||
    "Serwis Telefonów"
  );
}

import { getOptionalEnv } from "@/lib/env";

export interface IssuedCertificate {
  id: string;
  subject: string;
  role: string;
  email: string;
  serialNumber: string;
  notAfter: string;
  issuedAt: string;
  revokedAt?: string;
}

export interface IssueCertInput {
  commonName: string;
  email: string;
  role: "sprzedawca" | "serwisant" | "kierowca" | "dokumenty_access";
  ttlDays?: number;
}

function getBaseUrl(): string | null {
  const url = getOptionalEnv("STEP_CA_URL").trim();
  return url || null;
}

function getProvisionerPassword(): string | null {
  return getOptionalEnv("STEP_CA_PROVISIONER_PASSWORD") || null;
}

/** step-ca's /1.0/sign endpoint — requires valid JWT from provisioner. Full impl lands after step-ca deploy. */
export async function issueClientCertificate(_input: IssueCertInput): Promise<{ pkcs12: Buffer; meta: IssuedCertificate }> {
  if (!getBaseUrl()) {
    throw new Error("STEP_CA_URL not configured");
  }
  if (!getProvisionerPassword()) {
    throw new Error("STEP_CA_PROVISIONER_PASSWORD not configured");
  }
  throw new Error("step-ca integration pending deployment (Faza 2 — infrastructure/step-ca)");
}

export async function listCertificates(): Promise<IssuedCertificate[]> {
  return [];
}

export async function revokeCertificate(_serial: string, _reason: string): Promise<void> {
  throw new Error("step-ca integration pending deployment");
}

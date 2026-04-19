import * as forge from "node-forge";
import { compactDecrypt, importJWK, SignJWT } from "jose";
import { randomBytes } from "crypto";
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

interface Provisioner {
  type: string;
  name: string;
  key: Record<string, unknown>;
  encryptedKey: string;
}

function getBaseUrl(): string {
  const url = getOptionalEnv("STEP_CA_URL").trim().replace(/\/$/, "");
  if (!url) throw new Error("STEP_CA_URL not configured");
  return url;
}

function getProvisionerName(): string {
  return getOptionalEnv("STEP_CA_PROVISIONER_NAME", "admin@myperformance.pl");
}

function getProvisionerPassword(): string {
  const pw = getOptionalEnv("STEP_CA_PROVISIONER_PASSWORD");
  if (!pw) throw new Error("STEP_CA_PROVISIONER_PASSWORD not configured");
  return pw;
}

async function fetchProvisioner(): Promise<Provisioner> {
  const res = await fetch(`${getBaseUrl()}/provisioners`);
  if (!res.ok) throw new Error(`step-ca /provisioners failed: ${res.status}`);
  const body = (await res.json()) as { provisioners: Provisioner[] };
  const name = getProvisionerName();
  const p = body.provisioners.find((x) => x.name === name && x.type === "JWK");
  if (!p) throw new Error(`JWK provisioner ${name} not found`);
  return p;
}

async function decryptProvisionerKey(encryptedKey: string, password: string): Promise<Record<string, unknown>> {
  const pw = new TextEncoder().encode(password);
  const { plaintext } = await compactDecrypt(encryptedKey, pw);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function signOttToken(params: { provisioner: Provisioner; jwk: Record<string, unknown>; subject: string; sans: string[] }): Promise<string> {
  const { provisioner, jwk, subject, sans } = params;
  const kid = (jwk.kid as string | undefined) ?? (provisioner.key.kid as string | undefined);
  const key = await importJWK(jwk as Parameters<typeof importJWK>[0], "ES256");
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  return await new SignJWT({ sha: "", sans, step: { ssh: null } })
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(provisioner.name)
    .setAudience(`${getBaseUrl()}/1.0/sign`)
    .setSubject(subject)
    .setNotBefore(now - 30)
    .setExpirationTime(now + 300)
    .setJti(nonce)
    .sign(key);
}

function buildCsr(commonName: string, email: string, role: string): { csrPem: string; keyPem: string } {
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keypair.publicKey;
  csr.setSubject([
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "MyPerformance" },
    { name: "organizationalUnitName", value: role },
    { name: "emailAddress", value: email },
  ]);
  csr.setAttributes([
    {
      name: "extensionRequest",
      extensions: [
        {
          name: "subjectAltName",
          altNames: [
            { type: 1, value: email },
            { type: 2, value: commonName },
          ],
        },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", clientAuth: true },
      ],
    },
  ]);
  csr.sign(keypair.privateKey, forge.md.sha256.create());
  return {
    csrPem: forge.pki.certificationRequestToPem(csr),
    keyPem: forge.pki.privateKeyToPem(keypair.privateKey),
  };
}

function buildPkcs12(keyPem: string, certPem: string, caCertsPem: string[], password: string, friendlyName: string): Buffer {
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const cert = forge.pki.certificateFromPem(certPem);
  const caCerts = caCertsPem.map((p) => forge.pki.certificateFromPem(p));
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert, ...caCerts], password, {
    friendlyName,
    algorithm: "3des",
  });
  const bytes = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(bytes, "binary");
}

export async function issueClientCertificate(
  input: IssueCertInput
): Promise<{ pkcs12: Buffer; pkcs12Password: string; meta: IssuedCertificate }> {
  const provisioner = await fetchProvisioner();
  const jwk = await decryptProvisionerKey(provisioner.encryptedKey, getProvisionerPassword());
  const ott = await signOttToken({
    provisioner,
    jwk,
    subject: input.commonName,
    sans: [input.email, input.commonName],
  });
  const { csrPem, keyPem } = buildCsr(input.commonName, input.email, input.role);
  const ttlHours = (input.ttlDays ?? 365) * 24;
  const signRes = await fetch(`${getBaseUrl()}/1.0/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csr: csrPem, ott, notAfter: `${ttlHours}h` }),
  });
  if (!signRes.ok) {
    const body = await signRes.text();
    throw new Error(`step-ca /1.0/sign failed: ${signRes.status} ${body}`);
  }
  const signed = (await signRes.json()) as { crt: string; ca: string; certChain?: string[] };
  const pkcs12Password = randomBytes(9).toString("base64url");
  const caChain = signed.certChain && signed.certChain.length ? signed.certChain : signed.ca ? [signed.ca] : [];
  const pkcs12 = buildPkcs12(keyPem, signed.crt, caChain, pkcs12Password, `${input.commonName} (${input.role})`);
  const cert = forge.pki.certificateFromPem(signed.crt);
  const meta: IssuedCertificate = {
    id: cert.serialNumber,
    subject: input.commonName,
    role: input.role,
    email: input.email,
    serialNumber: cert.serialNumber,
    notAfter: cert.validity.notAfter.toISOString(),
    issuedAt: cert.validity.notBefore.toISOString(),
  };
  return { pkcs12, pkcs12Password, meta };
}

export async function listCertificates(): Promise<IssuedCertificate[]> {
  return [];
}

export async function revokeCertificate(_serial: string, _reason: string): Promise<void> {
  throw new Error("Revocation via step-ca admin API requires mTLS admin credentials — implement once admin cert provisioned");
}

export async function getRootCaPem(): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/roots.pem`);
  if (!res.ok) throw new Error(`step-ca /roots.pem failed: ${res.status}`);
  return await res.text();
}

export interface CaStatus {
  online: boolean;
  url: string;
  provisioner?: string;
  provisionerType?: string;
  error?: string;
}

export async function getCaStatus(): Promise<CaStatus> {
  const url = getBaseUrl();
  try {
    const [health, provRes] = await Promise.all([
      fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${url}/provisioners`, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!health.ok) return { online: false, url, error: `health ${health.status}` };
    let provisioner: string | undefined;
    let provisionerType: string | undefined;
    if (provRes.ok) {
      const data = (await provRes.json()) as { provisioners: Provisioner[] };
      const p = data.provisioners.find((x) => x.name === getProvisionerName());
      if (p) {
        provisioner = p.name;
        provisionerType = p.type;
      }
    }
    return { online: true, url, provisioner, provisionerType };
  } catch (err) {
    return { online: false, url, error: err instanceof Error ? err.message : "unknown" };
  }
}

type AuditEvent = { ts: string; actor: string; action: string; subject?: string; ok: boolean; error?: string };
const AUDIT_RING: AuditEvent[] = [];
const AUDIT_MAX = 200;

export function auditLog(ev: AuditEvent): void {
  AUDIT_RING.push(ev);
  if (AUDIT_RING.length > AUDIT_MAX) AUDIT_RING.shift();
}

export function getAuditTail(n = 50): AuditEvent[] {
  return AUDIT_RING.slice(-n).reverse();
}

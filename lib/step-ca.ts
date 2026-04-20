import * as forge from "node-forge";
import { compactDecrypt, importJWK, SignJWT } from "jose";
import { randomBytes } from "crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { getOptionalEnv } from "@/lib/env";

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

export interface IssueCertInput {
  commonName: string;
  email: string;
  roles: PanelRole[];
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
  const { plaintext } = await compactDecrypt(encryptedKey, pw, {
    keyManagementAlgorithms: ["PBES2-HS256+A128KW", "PBES2-HS384+A192KW", "PBES2-HS512+A256KW"],
    maxPBES2Count: 1_000_000,
  });
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function signOttToken(params: { provisioner: Provisioner; jwk: Record<string, unknown>; subject: string; sans: string[] }): Promise<string> {
  const { provisioner, jwk, subject, sans } = params;
  const kid = (jwk.kid as string | undefined) ?? (provisioner.key.kid as string | undefined);
  const alg =
    (jwk.alg as string | undefined) ??
    (provisioner.key.alg as string | undefined) ??
    "ES256";
  const key = await importJWK(jwk as Parameters<typeof importJWK>[0], alg);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  return await new SignJWT({ sha: "", sans, step: { ssh: null } })
    .setProtectedHeader({ alg, kid, typ: "JWT" })
    .setIssuer(provisioner.name)
    .setAudience(`${getBaseUrl()}/1.0/sign`)
    .setSubject(subject)
    .setNotBefore(now - 30)
    .setExpirationTime(now + 300)
    .setJti(nonce)
    .sign(key);
}

async function signRevokeToken(params: { provisioner: Provisioner; jwk: Record<string, unknown>; serial: string }): Promise<string> {
  const { provisioner, jwk, serial } = params;
  const kid = (jwk.kid as string | undefined) ?? (provisioner.key.kid as string | undefined);
  const alg =
    (jwk.alg as string | undefined) ??
    (provisioner.key.alg as string | undefined) ??
    "ES256";
  const key = await importJWK(jwk as Parameters<typeof importJWK>[0], alg);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  return await new SignJWT({ sha: "" })
    .setProtectedHeader({ alg, kid, typ: "JWT" })
    .setIssuer(provisioner.name)
    .setAudience(`${getBaseUrl()}/1.0/revoke`)
    .setSubject(serial)
    .setNotBefore(now - 30)
    .setExpirationTime(now + 300)
    .setJti(nonce)
    .sign(key);
}

function buildCsr(commonName: string, email: string, roles: PanelRole[]): { csrPem: string; keyPem: string } {
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keypair.publicKey;
  const utf8 = forge.asn1.Type.UTF8 as unknown as forge.asn1.Class;
  const ia5 = forge.asn1.Type.IA5STRING as unknown as forge.asn1.Class;
  csr.setSubject([
    { name: "commonName", value: commonName, valueTagClass: utf8 },
    { name: "organizationName", value: "MyPerformance", valueTagClass: utf8 },
    ...roles.map((r) => ({ name: "organizationalUnitName", value: r, valueTagClass: utf8 })),
    { name: "emailAddress", value: email, valueTagClass: ia5 },
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
  const caCerts: forge.pki.Certificate[] = [];
  for (const pem of caCertsPem) {
    try {
      caCerts.push(forge.pki.certificateFromPem(pem));
    } catch {
      // node-forge 1.x can't parse EC certs; skip chain entries it rejects.
      // Root CA is distributed separately via /roots.pem.
    }
  }
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
  const { csrPem, keyPem } = buildCsr(input.commonName, input.email, input.roles);
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
  const rolesLabel = input.roles.join(",");
  const pkcs12 = buildPkcs12(keyPem, signed.crt, caChain, pkcs12Password, `${input.commonName} (${rolesLabel})`);
  const cert = forge.pki.certificateFromPem(signed.crt);
  const meta: IssuedCertificate = {
    id: cert.serialNumber,
    subject: input.commonName,
    role: rolesLabel,
    roles: input.roles,
    email: input.email,
    serialNumber: cert.serialNumber,
    notAfter: cert.validity.notAfter.toISOString(),
    issuedAt: cert.validity.notBefore.toISOString(),
  };
  return { pkcs12, pkcs12Password, meta };
}

function getRegistryPath(): string {
  return getOptionalEnv("CERT_REGISTRY_PATH", "/data/certs.json");
}

export async function recordCertificate(meta: IssuedCertificate): Promise<void> {
  const path = getRegistryPath();
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, JSON.stringify(meta) + "\n", "utf8");
}

export async function listCertificates(): Promise<IssuedCertificate[]> {
  const path = getRegistryPath();
  let content: string;
  try {
    content = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const byId = new Map<string, IssuedCertificate>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as IssuedCertificate;
      const existing = byId.get(entry.id);
      byId.set(entry.id, existing ? { ...existing, ...entry } : entry);
    } catch {
      // skip malformed line
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

async function mtlsPostJson(
  url: string,
  body: string,
  cert: string,
  key: string
): Promise<{ status: number; body: string }> {
  const parsed = new URL(url);
  return await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: "POST",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        cert,
        key,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })
        );
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function revokeCertificate(
  serial: string,
  reason: string
): Promise<IssuedCertificate | null> {
  const provisioner = await fetchProvisioner();
  const jwk = await decryptProvisionerKey(provisioner.encryptedKey, getProvisionerPassword());
  // step-ca normalizes serial to decimal before comparing to OTT subject; emit decimal on both sides.
  const hex = serial.startsWith("0x") ? serial.slice(2) : serial;
  const decimal = /^[0-9]+$/.test(serial) ? serial : BigInt(`0x${hex}`).toString(10);
  const ott = await signRevokeToken({ provisioner, jwk, serial: decimal });
  const res = await fetch(`${getBaseUrl()}/1.0/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serial: decimal, ott, reasonCode: 0, reason, passive: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`step-ca /1.0/revoke failed: ${res.status} ${body}`);
  }
  const existing = (await listCertificates()).find(
    (c) => c.id === serial || c.serialNumber === serial
  );
  if (existing && !existing.revokedAt) {
    const updated: IssuedCertificate = {
      ...existing,
      revokedAt: new Date().toISOString(),
      revokedReason: reason,
    };
    await recordCertificate(updated);
    return updated;
  }
  return existing ?? null;
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

function getAuditPath(): string {
  return getOptionalEnv("AUDIT_LOG_PATH", "/data/audit.log");
}

export function auditLog(ev: AuditEvent): void {
  const path = getAuditPath();
  const line = JSON.stringify(ev) + "\n";
  fs.mkdir(dirname(path), { recursive: true })
    .then(() => fs.appendFile(path, line, "utf8"))
    .catch((err) => {
      console.error("[audit] append failed:", err instanceof Error ? err.message : err);
    });
}

async function tailLines(path: string, maxLines: number): Promise<string[]> {
  let fh: Awaited<ReturnType<typeof fs.open>>;
  try {
    fh = await fs.open(path, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  try {
    const { size } = await fh.stat();
    const CHUNK = 8192;
    let position = size;
    let collected = "";
    const linesNeeded = maxLines + 1;
    while (position > 0 && collected.split("\n").length <= linesNeeded) {
      const readSize = Math.min(CHUNK, position);
      position -= readSize;
      const buf = Buffer.alloc(readSize);
      await fh.read(buf, 0, readSize, position);
      collected = buf.toString("utf8") + collected;
    }
    const lines = collected.split("\n").filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  } finally {
    await fh.close();
  }
}

export async function getAuditTail(n = 50): Promise<AuditEvent[]> {
  const lines = await tailLines(getAuditPath(), n);
  const events: AuditEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      // skip malformed
    }
  }
  return events.reverse();
}

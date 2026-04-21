import * as forge from "node-forge";
import { compactDecrypt, importJWK, SignJWT } from "jose";
import { randomBytes } from "crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { getOptionalEnv } from "@/lib/env";
import {
  appendAudit,
  findCertificateBySerial,
  listCertificates as persistenceListCertificates,
  recordCertificate as persistenceRecordCertificate,
  tailAudit,
  type AuditEvent,
} from "@/lib/persistence";
import type { IssuedCertificate, PanelRole } from "@/lib/step-ca-types";

export type { IssuedCertificate, PanelRole } from "@/lib/step-ca-types";

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

/**
 * Escape a value for use inside an OpenSSL `-subj` string.
 * Slashes separate RDNs, backslash escapes within an RDN.
 */
function escapeSubjValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\//g, "\\/");
}

/**
 * Build a CSR via OpenSSL (child process). node-forge's CSR signer produces
 * a signature that step-ca rejects with "crypto/rsa: verification error"
 * whenever the subject contains non-ASCII bytes (Polish diacritics, etc.) —
 * node-forge re-encodes UTF8String fields between sign-time and serialize-
 * time, so the on-disk encoding no longer matches what was signed. OpenSSL
 * writes a canonical DER form once and hands back both key + CSR in PEM.
 */
async function buildCsr(
  commonName: string,
  email: string,
  roles: PanelRole[],
): Promise<{ csrPem: string; keyPem: string }> {
  const dir = await mkdtemp(join(tmpdir(), "csr-"));
  const keyPath = join(dir, "key.pem");
  const csrPath = join(dir, "csr.pem");
  try {
    await runOpenssl(["genrsa", "-out", keyPath, "2048"]);
    const subjectParts = [
      `CN=${escapeSubjValue(commonName)}`,
      `O=${escapeSubjValue("MyPerformance")}`,
      ...roles.map((r) => `OU=${escapeSubjValue(r)}`),
      `emailAddress=${escapeSubjValue(email)}`,
    ];
    const subj = "/" + subjectParts.join("/");
    await runOpenssl([
      "req",
      "-new",
      "-utf8",
      "-key",
      keyPath,
      "-out",
      csrPath,
      "-subj",
      subj,
      "-addext",
      `subjectAltName = email:${email}`,
      "-addext",
      "keyUsage = critical, digitalSignature, keyEncipherment",
      "-addext",
      "extendedKeyUsage = clientAuth",
    ]);
    const [csrPem, keyPem] = await Promise.all([
      readFile(csrPath, "utf8"),
      readFile(keyPath, "utf8"),
    ]);
    return { csrPem, keyPem };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runOpenssl(args: string[], stdinEnv?: Record<string, string>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn("openssl", args, {
      env: { ...process.env, ...(stdinEnv ?? {}) },
    });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`openssl ${args[0]} exit ${code}: ${stderr.trim()}`));
    });
  });
}

async function buildPkcs12(
  keyPem: string,
  certPem: string,
  caCertsPem: string[],
  password: string,
  friendlyName: string
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "p12-"));
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  const caPath = join(dir, "ca.pem");
  const outPath = join(dir, "out.p12");
  try {
    await writeFile(keyPath, keyPem, "utf8");
    await writeFile(certPath, certPem, "utf8");
    if (caCertsPem.length > 0) {
      await writeFile(caPath, caCertsPem.join("\n"), "utf8");
    }
    const args = [
      "pkcs12",
      "-export",
      "-out", outPath,
      "-inkey", keyPath,
      "-in", certPath,
      "-name", friendlyName,
      "-passout", "env:P12_PASS",
      "-macalg", "sha256",
      "-certpbe", "AES-256-CBC",
      "-keypbe", "AES-256-CBC",
    ];
    if (caCertsPem.length > 0) {
      args.push("-certfile", caPath);
    }
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("openssl", args, {
        env: { ...process.env, P12_PASS: password },
      });
      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`openssl pkcs12 exit ${code}: ${stderr.trim()}`));
      });
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  const { csrPem, keyPem } = await buildCsr(input.commonName, input.email, input.roles);
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
  const signedChain = signed.certChain && signed.certChain.length ? signed.certChain : signed.ca ? [signed.ca] : [];
  let rootPem = "";
  try {
    rootPem = (await getRootCaPem()).trim();
  } catch {
    // If roots endpoint is unreachable the import still works — macOS/Windows
    // will chain via an already-trusted root if the user installed it separately.
  }
  const caChain = rootPem ? [...signedChain, rootPem] : signedChain;
  const rolesLabel = input.roles.join(",");
  const pkcs12 = await buildPkcs12(keyPem, signed.crt, caChain, pkcs12Password, `${input.commonName} (${rolesLabel})`);
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

export async function recordCertificate(meta: IssuedCertificate): Promise<void> {
  await persistenceRecordCertificate(meta);
}

export async function listCertificates(): Promise<IssuedCertificate[]> {
  return persistenceListCertificates();
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
  const existing = await findCertificateBySerial(serial);
  if (existing && !existing.revokedAt) {
    const updated: IssuedCertificate = {
      ...existing,
      revokedAt: new Date().toISOString(),
      revokedReason: reason,
    };
    await persistenceRecordCertificate(updated);
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

export type { AuditEvent } from "@/lib/persistence";

export function auditLog(ev: AuditEvent): void {
  appendAudit(ev).catch((err) => {
    console.error("[audit] append failed:", err instanceof Error ? err.message : err);
  });
}

export async function getAuditTail(n = 50): Promise<AuditEvent[]> {
  return tailAudit(n);
}

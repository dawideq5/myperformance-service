import { createHash } from "crypto";
import { log } from "@/lib/logger";

/**
 * OVH API client. Używa proprietary HMAC-SHA1 signing:
 *   X-Ovh-Signature = "$1$" + sha1_hex(secret + "+" + consumer + "+" + method + "+" + url + "+" + body + "+" + ts)
 *
 * Nie korzystamy z `node-ovh` (npm) bo dodaje dep, a sam mechanizm jest
 * krótki. SDK ofic. (Python/Node) robią dokładnie to samo.
 */

const logger = log.child({ module: "ovh-client" });

export type OvhEndpoint = "ovh-eu" | "ovh-us" | "ovh-ca";

export interface OvhCredentials {
  endpoint: OvhEndpoint;
  appKey: string;
  appSecret: string;
  consumerKey: string;
}

const ENDPOINT_BASE_URLS: Record<OvhEndpoint, string> = {
  "ovh-eu": "https://eu.api.ovh.com/1.0",
  "ovh-us": "https://api.us.ovhcloud.com/1.0",
  "ovh-ca": "https://ca.api.ovh.com/1.0",
};

function baseUrl(endpoint: OvhEndpoint): string {
  return ENDPOINT_BASE_URLS[endpoint];
}

/** Pobiera serwerowy timestamp OVH — wymagane przez signing (anti-replay). */
async function getServerTime(endpoint: OvhEndpoint): Promise<number> {
  const res = await fetch(`${baseUrl(endpoint)}/auth/time`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OVH /auth/time failed: ${res.status}`);
  const txt = await res.text();
  return parseInt(txt, 10);
}

function sign(args: {
  secret: string;
  consumer: string;
  method: string;
  url: string;
  body: string;
  ts: number;
}): string {
  const input = `${args.secret}+${args.consumer}+${args.method}+${args.url}+${args.body}+${args.ts}`;
  const hex = createHash("sha1").update(input).digest("hex");
  return `$1$${hex}`;
}

export interface OvhResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { errorCode?: string; message?: string; class?: string };
}

export async function ovhRequest<T = unknown>(
  creds: OvhCredentials,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<OvhResponse<T>> {
  const url = `${baseUrl(creds.endpoint)}${path}`;
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const ts = await getServerTime(creds.endpoint);
  const signature = sign({
    secret: creds.appSecret,
    consumer: creds.consumerKey,
    method,
    url,
    body: bodyStr,
    ts,
  });
  const headers: Record<string, string> = {
    "X-Ovh-Application": creds.appKey,
    "X-Ovh-Consumer": creds.consumerKey,
    "X-Ovh-Timestamp": String(ts),
    "X-Ovh-Signature": signature,
  };
  if (bodyStr) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const err = (parsed && typeof parsed === "object" ? parsed : {}) as {
      errorCode?: string;
      message?: string;
      class?: string;
    };
    logger.warn("OVH API error", { method, path, status: res.status, error: err });
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

/**
 * Sprawdza czy credentials działają. Używa /auth/currentCredential —
 * zawsze dostępne dla zwalidowanego Consumer Key (nie wymaga osobnego
 * uprawnienia w rules). Zwraca status + rules + creation date.
 */
export async function verifyCredentials(
  creds: OvhCredentials,
): Promise<{
  ok: boolean;
  status?: string;
  rules?: Array<{ method: string; path: string }>;
  applicationId?: number;
  credentialId?: number;
  creation?: string;
  expiration?: string | null;
  lastUse?: string | null;
  error?: string;
  hint?: string;
}> {
  const res = await ovhRequest<{
    status: string;
    rules: Array<{ method: string; path: string }>;
    applicationId: number;
    credentialId: number;
    creation: string;
    expiration: string | null;
    lastUse: string | null;
  }>(creds, "GET", "/auth/currentCredential");
  if (res.ok && res.data) {
    return {
      ok: res.data.status === "validated",
      status: res.data.status,
      rules: res.data.rules,
      applicationId: res.data.applicationId,
      credentialId: res.data.credentialId,
      creation: res.data.creation,
      expiration: res.data.expiration,
      lastUse: res.data.lastUse,
      hint:
        res.data.status === "validated"
          ? undefined
          : `Status: ${res.data.status}. Klucz nie jest jeszcze zwalidowany — przejdź validation URL z OVH createToken.`,
    };
  }
  let hint: string | undefined;
  if (res.status === 403) {
    if (res.error?.errorCode === "INVALID_CREDENTIAL") {
      hint =
        'Consumer Key nie zwalidowany. Po wygenerowaniu na createToken OVH zwraca "validationUrl" — kliknij i potwierdź uprawnienia.';
    } else {
      hint =
        "403 — App Key, App Secret lub Consumer Key niepoprawny. Sprawdź pisownię (App Key to 16 hex chars, np. cyfra 3 nie cyrylica З).";
    }
  } else if (res.status === 401) {
    hint = "Nieprawidłowy podpis — sprawdź App Secret.";
  } else if (res.status === 404) {
    hint = "Wybrany endpoint regionu (eu/us/ca) nie pasuje do konta OVH.";
  }
  return {
    ok: false,
    error: res.error?.message ?? `HTTP ${res.status}`,
    hint,
  };
}

// ── Email domains + accounts ────────────────────────────────────────────────

export interface OvhEmailDomain {
  name: string;
  /** Liczba mailboxów. */
  mailboxCount?: number;
}

export async function listEmailDomains(
  creds: OvhCredentials,
): Promise<string[]> {
  const res = await ovhRequest<string[]>(creds, "GET", "/email/domain");
  if (!res.ok) {
    throw new Error(
      `OVH listEmailDomains failed: ${res.status} ${res.error?.message ?? ""}`,
    );
  }
  return res.data ?? [];
}

export interface OvhEmailAccount {
  email: string;
  domain: string;
  size: number; // quota MB
  description: string | null;
  isBlocked: boolean;
  state: string;
  primaryEmailAddress: string;
}

/** Lista nazw skrzynek dla domeny (sam local part — bez @domain). */
export async function listMailboxNames(
  creds: OvhCredentials,
  domain: string,
): Promise<string[]> {
  const res = await ovhRequest<string[]>(
    creds,
    "GET",
    `/email/domain/${encodeURIComponent(domain)}/account`,
  );
  if (!res.ok) {
    throw new Error(
      `OVH listMailboxes(${domain}) failed: ${res.status} ${res.error?.message ?? ""}`,
    );
  }
  return res.data ?? [];
}

export async function getMailbox(
  creds: OvhCredentials,
  domain: string,
  account: string,
): Promise<OvhEmailAccount | null> {
  const res = await ovhRequest<OvhEmailAccount>(
    creds,
    "GET",
    `/email/domain/${encodeURIComponent(domain)}/account/${encodeURIComponent(account)}`,
  );
  if (!res.ok) return null;
  return res.data ?? null;
}

// ── Domains (DNS zones) ─────────────────────────────────────────────────────

export async function listDomains(
  creds: OvhCredentials,
): Promise<string[]> {
  const res = await ovhRequest<string[]>(creds, "GET", "/domain");
  if (!res.ok) {
    throw new Error(`OVH listDomains failed: ${res.status} ${res.error?.message ?? ""}`);
  }
  return res.data ?? [];
}

// ── DNS zone management ─────────────────────────────────────────────────────

export interface DnsRecord {
  id: number;
  fieldType: string;
  subDomain: string;
  target: string;
  ttl: number;
  zone: string;
}

export async function listDnsRecords(
  creds: OvhCredentials,
  zone: string,
  filter?: { fieldType?: string; subDomain?: string },
): Promise<number[]> {
  const qs = new URLSearchParams();
  if (filter?.fieldType) qs.set("fieldType", filter.fieldType);
  if (filter?.subDomain) qs.set("subDomain", filter.subDomain);
  const path = `/domain/zone/${encodeURIComponent(zone)}/record${qs.toString() ? `?${qs}` : ""}`;
  const res = await ovhRequest<number[]>(creds, "GET", path);
  if (!res.ok) throw new Error(`OVH listDnsRecords ${res.status}`);
  return res.data ?? [];
}

export async function getDnsRecord(
  creds: OvhCredentials,
  zone: string,
  id: number,
): Promise<DnsRecord> {
  const res = await ovhRequest<DnsRecord>(
    creds,
    "GET",
    `/domain/zone/${encodeURIComponent(zone)}/record/${id}`,
  );
  if (!res.ok) throw new Error(`OVH getDnsRecord ${res.status}`);
  return res.data!;
}

export async function createDnsRecord(
  creds: OvhCredentials,
  zone: string,
  record: { fieldType: string; subDomain: string; target: string; ttl?: number },
): Promise<DnsRecord> {
  const res = await ovhRequest<DnsRecord>(
    creds,
    "POST",
    `/domain/zone/${encodeURIComponent(zone)}/record`,
    record,
  );
  if (!res.ok) throw new Error(`OVH createDnsRecord ${res.status} ${res.error?.message ?? ""}`);
  return res.data!;
}

export async function deleteDnsRecord(
  creds: OvhCredentials,
  zone: string,
  id: number,
): Promise<void> {
  const res = await ovhRequest(
    creds,
    "DELETE",
    `/domain/zone/${encodeURIComponent(zone)}/record/${id}`,
  );
  if (!res.ok) throw new Error(`OVH deleteDnsRecord ${res.status}`);
}

export async function refreshDnsZone(
  creds: OvhCredentials,
  zone: string,
): Promise<void> {
  const res = await ovhRequest(
    creds,
    "POST",
    `/domain/zone/${encodeURIComponent(zone)}/refresh`,
    {},
  );
  if (!res.ok) throw new Error(`OVH refreshDnsZone ${res.status}`);
}

// ── VPS ─────────────────────────────────────────────────────────────────────

export interface VpsInfo {
  name: string;
  displayName: string;
  state: string;
  zone: string;
  netbootMode: string;
  vcore: number;
  memoryLimit: number;
  offerType: string;
  model: { name: string; disk: number; memory: number; vcore: number };
  iam?: { state: string; urn: string };
}

export async function listVps(creds: OvhCredentials): Promise<string[]> {
  const res = await ovhRequest<string[]>(creds, "GET", "/vps");
  if (!res.ok) throw new Error(`OVH listVps ${res.status}`);
  return res.data ?? [];
}

export async function getVpsInfo(
  creds: OvhCredentials,
  name: string,
): Promise<VpsInfo> {
  const res = await ovhRequest<VpsInfo>(creds, "GET", `/vps/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`OVH getVpsInfo ${res.status}`);
  return res.data!;
}

export interface VpsAutomatedBackup {
  state: string;
  schedule: string;
  serviceResourceName: string;
  rotation: number;
}

export async function getAutomatedBackup(
  creds: OvhCredentials,
  name: string,
): Promise<VpsAutomatedBackup | null> {
  const res = await ovhRequest<VpsAutomatedBackup>(
    creds,
    "GET",
    `/vps/${encodeURIComponent(name)}/automatedBackup`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OVH getAutomatedBackup ${res.status}`);
  return res.data!;
}

export interface VpsSnapshot {
  id: string;
  description: string;
  creationDate: string;
  region: string;
}

export async function getSnapshot(
  creds: OvhCredentials,
  name: string,
): Promise<VpsSnapshot | null> {
  const res = await ovhRequest<VpsSnapshot>(
    creds,
    "GET",
    `/vps/${encodeURIComponent(name)}/snapshot`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OVH getSnapshot ${res.status}`);
  return res.data!;
}

export async function createSnapshot(
  creds: OvhCredentials,
  name: string,
  description: string,
): Promise<{ id: number }> {
  const res = await ovhRequest<{ id: number }>(
    creds,
    "POST",
    `/vps/${encodeURIComponent(name)}/snapshot`,
    { description },
  );
  if (!res.ok) throw new Error(`OVH createSnapshot ${res.status} ${res.error?.message ?? ""}`);
  return res.data!;
}

export interface VpsIp {
  ipAddress: string;
  type: string;
  reverse?: string;
}

export async function getVpsIps(
  creds: OvhCredentials,
  name: string,
): Promise<string[]> {
  const res = await ovhRequest<string[]>(
    creds,
    "GET",
    `/vps/${encodeURIComponent(name)}/ips`,
  );
  if (!res.ok) return [];
  return res.data ?? [];
}

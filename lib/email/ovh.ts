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
 * Sprawdza czy credentials działają (czy consumer key jest aktywny).
 * Wywołuje GET /me — zwraca podstawowe info o koncie.
 */
export async function verifyCredentials(
  creds: OvhCredentials,
): Promise<{
  ok: boolean;
  account?: { nichandle?: string; email?: string; firstname?: string; name?: string };
  error?: string;
  hint?: string;
}> {
  const res = await ovhRequest<{
    nichandle: string;
    email: string;
    firstname: string;
    name: string;
  }>(creds, "GET", "/me");
  if (res.ok && res.data) {
    return {
      ok: true,
      account: {
        nichandle: res.data.nichandle,
        email: res.data.email,
        firstname: res.data.firstname,
        name: res.data.name,
      },
    };
  }
  // Przyjazne wskazówki
  let hint: string | undefined;
  if (res.status === 403) {
    if (res.error?.errorCode === "INVALID_CREDENTIAL") {
      hint =
        'Consumer Key nie został zwalidowany. Po wygenerowaniu na createToken/ OVH wymaga że KLIKNIESZ w "validation URL" zwrócony w odpowiedzi (zwykle wysyłany na email lub wyświetlony w UI). Bez tego klucz nie ma dostępu.';
    } else if (res.error?.errorCode === "NOT_GRANTED_CALL") {
      hint =
        "Consumer Key nie ma uprawnień do tego endpointu. Wygeneruj nowy token z odpowiednimi rights (GET /me, GET /domain, GET /email/domain itp).";
    } else {
      hint =
        "403 Forbidden — sprawdź: 1) czy App Key, App Secret i Consumer Key są poprawne (brak literówek), 2) czy Consumer Key został zaakceptowany (validation URL).";
    }
  } else if (res.status === 401) {
    hint = "Nieprawidłowy podpis — sprawdź App Secret i Consumer Key.";
  } else if (res.status === 404) {
    hint = "Endpoint nie istnieje — może wybrałeś zły OVH endpoint (eu/us/ca).";
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

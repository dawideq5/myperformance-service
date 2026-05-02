import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { getOvhConfig } from "@/lib/email/db";
import {
  getMailbox,
  listEmailDomains,
  listMailboxNames,
  type OvhCredentials,
} from "@/lib/email/ovh";

/**
 * Agregator listy zweryfikowanych adresów email z OVH (z cache 10min).
 *
 * Zwraca tylko skrzynki active (state="ok") + nieblokowane. Used przez
 * `/admin/correspondence` jako lewa kolumna (lista skrzynek do podglądu
 * korespondencji + counterów).
 *
 * Cache w pamięci 10 min — OVH API ma rate limit per consumer key.
 */

const logger = log.child({ module: "ovh-email-aggregator" });

export interface VerifiedEmailAccount {
  email: string;
  domain: string;
  description: string | null;
  /** quota MB */
  size: number;
  state: string;
  isBlocked: boolean;
}

interface CacheEntry {
  fetchedAt: number;
  accounts: VerifiedEmailAccount[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: CacheEntry | null = null;

function isVerified(state: string, isBlocked: boolean): boolean {
  // OVH state values: "ok", "creating", "deleting", "modification", "blocked".
  // Wymagamy "ok" + nieblokowane, żeby user widział tylko realnie używalne
  // skrzynki w panelu korespondencji.
  return state === "ok" && !isBlocked;
}

/**
 * Lista domen do skanowania. Source-of-truth: env `OVH_EMAIL_DOMAINS` (CSV).
 * Fallback: pobierz wszystkie domeny z konta OVH (wolniejsze, ale działa
 * out-of-the-box).
 */
async function resolveDomains(creds: OvhCredentials): Promise<string[]> {
  const csv = getOptionalEnv("OVH_EMAIL_DOMAINS");
  if (csv) {
    return csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  try {
    return await listEmailDomains(creds);
  } catch (err) {
    logger.warn("listEmailDomains failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function fetchAccountsForDomain(
  creds: OvhCredentials,
  domain: string,
): Promise<VerifiedEmailAccount[]> {
  let accountNames: string[] = [];
  try {
    accountNames = await listMailboxNames(creds, domain);
  } catch (err) {
    logger.warn("listMailboxNames failed", {
      domain,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  // 50 mailboxów per domena to praktyczny limit żeby nie zalać OVH.
  const limited = accountNames.slice(0, 50);
  const results = await Promise.all(
    limited.map(async (name) => {
      const m = await getMailbox(creds, domain, name).catch(() => null);
      if (!m) return null;
      if (!isVerified(m.state, m.isBlocked)) return null;
      const email = m.primaryEmailAddress || `${name}@${domain}`;
      return {
        email,
        domain,
        description: m.description,
        size: m.size,
        state: m.state,
        isBlocked: m.isBlocked,
      } satisfies VerifiedEmailAccount;
    }),
  );
  return results.filter((x): x is VerifiedEmailAccount => x !== null);
}

/**
 * Lista zweryfikowanych adresów email — w cache 10 min. Przy każdym wywołaniu
 * sprawdzamy ważność cache i fetchujemy ponownie tylko jeśli przeterminowane.
 */
export async function listVerifiedEmailAccounts(opts?: {
  forceRefresh?: boolean;
}): Promise<VerifiedEmailAccount[]> {
  if (!opts?.forceRefresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.accounts;
  }
  const config = await getOvhConfig().catch(() => null);
  if (!config || !config.appKey || !config.appSecret || !config.consumerKey) {
    logger.info("OVH not configured — returning empty mailbox list");
    cache = { fetchedAt: Date.now(), accounts: [] };
    return [];
  }
  const creds: OvhCredentials = {
    endpoint: config.endpoint,
    appKey: config.appKey,
    appSecret: config.appSecret,
    consumerKey: config.consumerKey,
  };
  const domains = await resolveDomains(creds);
  if (domains.length === 0) {
    cache = { fetchedAt: Date.now(), accounts: [] };
    return [];
  }
  const all: VerifiedEmailAccount[] = [];
  for (const domain of domains) {
    const accs = await fetchAccountsForDomain(creds, domain);
    all.push(...accs);
  }
  // Deduplikuj po email (gdyby dwa razy ten sam adres trafił do listy).
  const seen = new Set<string>();
  const unique = all.filter((a) => {
    const key = a.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.email.localeCompare(b.email));
  cache = { fetchedAt: Date.now(), accounts: unique };
  return unique;
}

/** Forceuje invalidację cache (np. po dodaniu skrzynki w innym miejscu). */
export function invalidateVerifiedAccountsCache(): void {
  cache = null;
}

/** True gdy OVH credentials skonfigurowane (do UI message). */
export async function isOvhConfigured(): Promise<boolean> {
  const config = await getOvhConfig().catch(() => null);
  return !!(config && config.appKey && config.appSecret && config.consumerKey);
}

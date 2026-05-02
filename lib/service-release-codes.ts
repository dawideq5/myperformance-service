/**
 * Wave 21 / Faza 1C — Kody wydania urządzenia (release codes).
 *
 * 6-cyfrowy kod (crypto.randomInt) generowany przy intake serwisowym; klient
 * podaje go w "Wydaj urządzenie" po finalnym statusie. Kod plain NIGDY nie
 * jest persistowany — w DB trzymamy `code_hash = sha256(code + salt)` +
 * `code_salt` (16-byte random hex). Kod plain wraca tylko z `generateReleaseCode`
 * jednorazowo do wysłania kanałem (email/SMS/papier).
 *
 * Bruteforce protection:
 *   - increment `attempts` przy każdym błędnym podaniu kodu,
 *   - po 5 błędach `locked_until = now + 30min`, kolejne `verifyReleaseCode`
 *     zwracają `ok: false, lockedUntil` aż do upływu locka,
 *   - po skutecznej weryfikacji `used_at` zostaje wypełnione i kolejne
 *     `verifyReleaseCode` zwracają `ok: false` (kod jednorazowy).
 *
 * UNIQUE(service_id) — 1 aktywny rekord per zlecenie. `resendReleaseCode`
 * regeneruje (nowy salt + hash) i czyści attempts/locked_until/used_at;
 * to celowo invaliduje stary kod (klient mógł go zgubić, generujemy nowy).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "service-release-codes" });

const COLLECTION = "mp_service_release_codes";
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 60 * 1000;

export type ReleaseCodeChannel = "email" | "sms" | "paper" | "none";

export interface ReleaseCodeRecord {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  sentVia: ReleaseCodeChannel;
  sentAt: string | null;
  usedAt: string | null;
  usedByEmail: string | null;
  attempts: number;
  lockedUntil: string | null;
  createdAt: string | null;
}

interface Row {
  id: string;
  service_id: string;
  ticket_number: string | null;
  code_hash: string;
  code_salt: string;
  sent_via: ReleaseCodeChannel | null;
  sent_at: string | null;
  used_at: string | null;
  used_by_email: string | null;
  attempts: number | string | null;
  locked_until: string | null;
  created_at: string | null;
}

function mapRow(r: Row): ReleaseCodeRecord {
  const att =
    typeof r.attempts === "number"
      ? r.attempts
      : Number.isFinite(Number(r.attempts))
        ? Number(r.attempts)
        : 0;
  return {
    id: r.id,
    serviceId: r.service_id,
    ticketNumber: r.ticket_number,
    sentVia: (r.sent_via ?? "none") as ReleaseCodeChannel,
    sentAt: r.sent_at,
    usedAt: r.used_at,
    usedByEmail: r.used_by_email,
    attempts: att,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
  };
}

function generateSixDigitCode(): string {
  // randomInt(min, max): min inclusive, max exclusive. Range [0, 999_999].
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${code}${salt}`).digest("hex");
}

async function fetchByServiceId(serviceId: string): Promise<Row | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<Row>(COLLECTION, {
      "filter[service_id][_eq]": serviceId,
      limit: 1,
    });
    return rows[0] ?? null;
  } catch (err) {
    logger.warn("fetchByServiceId failed", { serviceId, err: String(err) });
    return null;
  }
}

export interface GenerateReleaseCodeResult {
  /** 6-cyfrowy kod plain — JEDYNIE zwracany do natychmiastowego użycia
   * (notify channel). NIE persistuj. */
  code: string;
  /** ID rekordu w `mp_service_release_codes`. */
  codeId: string;
}

/**
 * Generuje (lub re-generuje gdy istnieje) kod wydania dla zlecenia. Plain
 * code zwracany jednorazowo. Re-gen kasuje attempts/locked_until/used_at —
 * stary kod staje się nieaktywny przez zmianę salt+hash.
 */
export async function generateReleaseCode(
  serviceId: string,
  ticketNumber: string | null = null,
): Promise<GenerateReleaseCodeResult | null> {
  if (!(await directusConfigured())) return null;
  const code = generateSixDigitCode();
  const salt = randomBytes(16).toString("hex");
  const codeHash = hashCode(code, salt);
  try {
    const existing = await fetchByServiceId(serviceId);
    if (existing) {
      await updateItem<Row>(COLLECTION, existing.id, {
        code_hash: codeHash,
        code_salt: salt,
        attempts: 0,
        locked_until: null,
        used_at: null,
        used_by_email: null,
        sent_via: "none",
        sent_at: null,
      });
      return { code, codeId: existing.id };
    }
    const created = await createItem<Row>(COLLECTION, {
      service_id: serviceId,
      ticket_number: ticketNumber,
      code_hash: codeHash,
      code_salt: salt,
      sent_via: "none",
      attempts: 0,
    });
    return { code, codeId: created.id };
  } catch (err) {
    logger.error("generateReleaseCode failed", {
      serviceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface VerifyReleaseCodeResult {
  ok: boolean;
  /** Pozostałe próby (gdy ok=false i nie jest zalockowany). */
  attemptsLeft?: number;
  /** ISO gdy konto/kod zalockowany do tej pory. */
  lockedUntil?: string;
  /** Powód błędu — przydatny dla loggera/UI. */
  reason?:
    | "no_record"
    | "locked"
    | "already_used"
    | "invalid_code"
    | "directus_unconfigured";
}

/**
 * Weryfikuje 6-cyfrowy kod. Constant-time-ish compare (sha256 = bezsens dla
 * timing — hash zwraca 64 hex znaki, equality w JS leaks niewiele dla
 * deterministycznych hashy). Po skutecznej weryfikacji ustawia `used_at` —
 * kod staje się jednorazowy.
 */
export async function verifyReleaseCode(
  serviceId: string,
  code: string,
  byEmail: string | null,
): Promise<VerifyReleaseCodeResult> {
  if (!(await directusConfigured())) {
    return { ok: false, reason: "directus_unconfigured" };
  }
  const trimmed = (code ?? "").replace(/\D/g, "");
  if (trimmed.length !== 6) {
    return { ok: false, reason: "invalid_code", attemptsLeft: undefined };
  }
  const row = await fetchByServiceId(serviceId);
  if (!row) {
    return { ok: false, reason: "no_record" };
  }
  // Sprawdź lock
  if (row.locked_until) {
    const until = new Date(row.locked_until).getTime();
    if (Number.isFinite(until) && until > Date.now()) {
      return {
        ok: false,
        reason: "locked",
        lockedUntil: row.locked_until,
      };
    }
  }
  if (row.used_at) {
    return { ok: false, reason: "already_used" };
  }
  const expected = row.code_hash;
  const got = hashCode(trimmed, row.code_salt);
  // Equality OK — both 64-char hex z deterministycznego sha256, brak sekretu
  // do leakowania przez timing (salt jest publiczny w DB, attacker który ma
  // db read i tak widzi cały hash).
  if (got === expected) {
    try {
      await updateItem<Row>(COLLECTION, row.id, {
        used_at: new Date().toISOString(),
        used_by_email: byEmail,
        attempts: 0,
        locked_until: null,
      });
    } catch (err) {
      logger.warn("verifyReleaseCode mark-used failed", {
        serviceId,
        err: String(err),
      });
    }
    return { ok: true };
  }
  // Niepoprawny kod — increment attempts, lock przy 5.
  const currentAttempts =
    typeof row.attempts === "number"
      ? row.attempts
      : Number.isFinite(Number(row.attempts))
        ? Number(row.attempts)
        : 0;
  const newAttempts = currentAttempts + 1;
  const patch: Record<string, unknown> = { attempts: newAttempts };
  let lockedUntil: string | undefined;
  if (newAttempts >= MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
    patch.locked_until = lockedUntil;
  }
  try {
    await updateItem<Row>(COLLECTION, row.id, patch);
  } catch (err) {
    logger.warn("verifyReleaseCode update-attempts failed", {
      serviceId,
      err: String(err),
    });
  }
  if (lockedUntil) {
    return { ok: false, reason: "locked", lockedUntil };
  }
  return {
    ok: false,
    reason: "invalid_code",
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - newAttempts),
  };
}

/**
 * Zwraca metadane (bez plain code/hash/salt) dla UI panelu — np. "ostatnio
 * wysłane via email 5 minut temu, zostało N prób, locked_until = ...".
 */
export async function getReleaseCodeRecord(
  serviceId: string,
): Promise<ReleaseCodeRecord | null> {
  const row = await fetchByServiceId(serviceId);
  return row ? mapRow(row) : null;
}

export interface MarkSentInput {
  serviceId: string;
  channel: Exclude<ReleaseCodeChannel, "none">;
}

/** Po skutecznej wysyłce kanałem (email/sms/paper) ustaw `sent_via` + `sent_at`. */
export async function markReleaseCodeSent(
  input: MarkSentInput,
): Promise<void> {
  if (!(await directusConfigured())) return;
  try {
    const row = await fetchByServiceId(input.serviceId);
    if (!row) return;
    await updateItem<Row>(COLLECTION, row.id, {
      sent_via: input.channel,
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("markReleaseCodeSent failed", {
      serviceId: input.serviceId,
      err: String(err),
    });
  }
}

/**
 * Re-generuje kod (nowy salt + hash). Stary kod staje się nieaktywny —
 * klient musi użyć nowego. Zwraca plain code do wysłania (lub null gdy
 * Directus niedostępny).
 */
export async function resendReleaseCode(
  serviceId: string,
  ticketNumber: string | null = null,
): Promise<GenerateReleaseCodeResult | null> {
  return generateReleaseCode(serviceId, ticketNumber);
}

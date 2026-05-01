import { Pool, type PoolClient } from "pg";
import mysql from "mysql2/promise";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "db" });

/**
 * Wspólny pool połączeń do dashboard DB. Wszystkie moduły (security,
 * permissions, email, two-factor, etc.) muszą używać tego samego pool —
 * inaczej dla każdego pliku tworzy się osobny pool max=3 i łatwo wyczerpać
 * limit Postgresa pod obciążeniem.
 *
 * `withClient` automatycznie release'uje klienta. `withTx` opakowuje w
 * transakcję — używaj gdy potrzebujesz spójności wielu zapytań.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = getOptionalEnv("DATABASE_URL").trim();
  if (!url) throw new Error("DATABASE_URL not configured");
  const sslDisabled = url.includes("sslmode=disable");
  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: sslDisabled ? false : undefined,
  });
  pool.on("error", (err) => {
    logger.error("pg pool error", { err: err.message });
  });
  return pool;
}

export async function withClient<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

export async function withTx<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  return withClient(async (c) => {
    await c.query("BEGIN");
    try {
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
}

/**
 * External-DB pools (Chatwoot, Documenso). Każdy provider ma swój
 * connection string z env, ale dzielimy pool dla wielu route handlerów
 * — wcześniej 2× chatwoot, 3× documenso miało osobne `let pool` w
 * każdym pliku.
 */

const externalPools = new Map<string, Pool>();

export function getExternalPool(envName: string): Pool {
  const cached = externalPools.get(envName);
  if (cached) return cached;
  const url = getOptionalEnv(envName).trim();
  if (!url) throw new Error(`${envName} not configured`);
  const p = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  p.on("error", (err) => {
    logger.error(`pg pool error (${envName})`, { err: err.message });
  });
  externalPools.set(envName, p);
  return p;
}

/**
 * Dev-only: external services używają Docker-internal hostnames
 * (`database-c9d...`, `mariadb-iut9w...`) które są resolvowane tylko
 * wewnątrz prod docker network. Z lokalnej maszyny dostajemy ENOTFOUND.
 * Pierwszy fail zapamiętujemy w `unavailableExternals` i kolejne calle
 * od razu rzucają lekki błąd zamiast spamować pool reconnect-stormem.
 */
const unavailableExternals = new Set<string>();

export class ExternalServiceUnavailableError extends Error {
  constructor(envName: string, cause: string) {
    super(`External service ${envName} unavailable in dev: ${cause}`);
    this.name = "ExternalServiceUnavailableError";
  }
}

function isUnreachableError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT"
  );
}

export async function withExternalClient<T>(
  envName: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  if (unavailableExternals.has(envName)) {
    throw new ExternalServiceUnavailableError(envName, "previously unreachable");
  }
  let c: PoolClient;
  try {
    c = await getExternalPool(envName).connect();
  } catch (err) {
    if (process.env.NODE_ENV === "development" && isUnreachableError(err)) {
      if (!unavailableExternals.has(envName)) {
        unavailableExternals.add(envName);
        logger.warn(`external service ${envName} unreachable in dev — disabling`, {
          err: (err as Error).message,
        });
      }
      throw new ExternalServiceUnavailableError(envName, (err as Error).message);
    }
    throw err;
  }
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

/**
 * MySQL counterpart dla withExternalClient — Moodle używa MariaDB/MySQL,
 * więc pg Pool nie zadziała. Te same reguły: jeden pool per envName,
 * dev graceful-degrade dla docker-internal hostnamów.
 */
const externalMysqlPools = new Map<string, mysql.Pool>();

export function getExternalMysqlPool(envName: string): mysql.Pool {
  const cached = externalMysqlPools.get(envName);
  if (cached) return cached;
  const url = getOptionalEnv(envName).trim();
  if (!url) throw new Error(`${envName} not configured`);
  const p = mysql.createPool({
    uri: url,
    connectionLimit: 5,
    waitForConnections: true,
    connectTimeout: 10_000,
  });
  externalMysqlPools.set(envName, p);
  return p;
}

export async function withExternalMysql<T>(
  envName: string,
  fn: (p: mysql.Pool) => Promise<T>,
): Promise<T> {
  if (unavailableExternals.has(envName)) {
    throw new ExternalServiceUnavailableError(envName, "previously unreachable");
  }
  try {
    const p = getExternalMysqlPool(envName);
    // Probe — `getConnection` próbuje resolve+TCP. Bez tego ENOTFOUND wypływa
    // dopiero przy pierwszym `execute()` co utrudnia jednoznaczne złapanie.
    const probe = await p.getConnection();
    probe.release();
    return await fn(p);
  } catch (err) {
    if (process.env.NODE_ENV === "development" && isUnreachableError(err)) {
      if (!unavailableExternals.has(envName)) {
        unavailableExternals.add(envName);
        logger.warn(`external mysql ${envName} unreachable in dev — disabling`, {
          err: (err as Error).message,
        });
      }
      throw new ExternalServiceUnavailableError(envName, (err as Error).message);
    }
    throw err;
  }
}

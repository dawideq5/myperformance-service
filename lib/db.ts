import { Pool, type PoolClient } from "pg";
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
  pool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
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

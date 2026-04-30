import { type PoolClient } from "pg";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { getPool } from "@/lib/db";
import { ensureSchema } from "./schema";

export const logger = log.child({ module: "email-db" });

let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL").trim();
  return url.length > 0 ? url : null;
}

export async function withEmailClient<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const p = getPool();
  if (!schemaReady) {
    schemaReady = (async () => {
      const c = await p.connect();
      try {
        await ensureSchema(c);
      } finally {
        c.release();
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
  const c = await p.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

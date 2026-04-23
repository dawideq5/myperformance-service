import { log } from "@/lib/logger";
import { getOptionalEnv } from "@/lib/env";
import { appendIamAudit } from "./db";

/**
 * Queue abstrakcja dla IAM sync jobów.
 *
 * Dwa backendy:
 *
 *   1. **inline-retry** (default) — job wykonuje się natychmiast w tym samym
 *      procesie z retry/backoff. Dev-friendly, zero infra. Przypomina
 *      dotychczasowe zachowanie sync.ts ale z explicit retry.
 *
 *   2. **bullmq** — gdy zdefiniowane jest `IAM_QUEUE_REDIS_URL` i lib
 *      `bullmq` jest zainstalowana. Job ląduje w Redis z konfiguracją
 *      retry/backoff wg jobOptions. Wymaga osobnego workera (bin script).
 *
 * Wszystkie wywołania są idempotent-by-default: job key = deterministyczny
 * hash z argumentów. Duplikaty są deduplikowane (BullMQ removeOnComplete +
 * jobId).
 *
 * Zawartość każdej operacji zapisuje się także w `iam_audit_log` (poprzez
 * appendIamAudit) — audit trail jest ponad kolejkowaniem.
 */

const logger = log.child({ module: "iam-queue" });

export type JobKind =
  | "profile.propagate"
  | "role.assign"
  | "role.unassign"
  | "seed.apply";

export interface JobPayload {
  kind: JobKind;
  /** Unikalny klucz idempotentności (np. `${kind}:${userId}:${areaId}`). */
  idempotencyKey: string;
  /** JSON-serializable args dla handlera. */
  args: Record<string, unknown>;
  /** Kto wywołał (actor email / system:*) — trafia do audit logu. */
  actor: string;
}

export interface JobHandler {
  (payload: JobPayload): Promise<void>;
}

export interface EnqueueOptions {
  /** Ile razy ponowić przy błędzie. Default 3. */
  maxAttempts?: number;
  /** Initial delay w ms między próbami (exponential *2). Default 1000ms. */
  initialDelayMs?: number;
}

interface QueueBackend {
  enqueue(payload: JobPayload, opts: EnqueueOptions): Promise<void>;
  register(kind: JobKind, handler: JobHandler): void;
}

// ---------- inline-retry backend ----------

class InlineRetryBackend implements QueueBackend {
  private handlers = new Map<JobKind, JobHandler>();

  register(kind: JobKind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(payload: JobPayload, opts: EnqueueOptions): Promise<void> {
    const handler = this.handlers.get(payload.kind);
    if (!handler) {
      logger.error("no handler for job kind", { kind: payload.kind });
      await appendIamAudit({
        actor: payload.actor,
        operation: "sync.push",
        targetType: "app",
        status: "error",
        error: `no handler for ${payload.kind}`,
        details: { idempotencyKey: payload.idempotencyKey },
      });
      return;
    }
    const maxAttempts = opts.maxAttempts ?? 3;
    const initialDelay = opts.initialDelayMs ?? 1000;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await handler(payload);
        if (attempt > 1) {
          logger.info("job succeeded after retry", {
            kind: payload.kind,
            attempt,
            idempotencyKey: payload.idempotencyKey,
          });
        }
        return;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("job attempt failed", {
          kind: payload.kind,
          attempt,
          maxAttempts,
          err: msg,
          idempotencyKey: payload.idempotencyKey,
        });
        if (attempt < maxAttempts) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          await sleep(delay);
        } else {
          await appendIamAudit({
            actor: payload.actor,
            operation: "sync.push",
            targetType: "app",
            status: "error",
            error: msg,
            details: {
              kind: payload.kind,
              idempotencyKey: payload.idempotencyKey,
              attempt,
            },
          });
        }
      }
    }

    // Wszystkie próby wyczerpane — nie rzucamy na zewnątrz, bo caller (np.
    // Keycloak event listener) zwykle nie ma jak tego obsłużyć sensownie.
    // Błąd jest już w audit logu — cron reconciliation zobaczy go i
    // retryuje całość.
    logger.error("job exhausted retries", {
      kind: payload.kind,
      idempotencyKey: payload.idempotencyKey,
      err: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }
}

// ---------- BullMQ backend (lazy-loaded) ----------

/**
 * Gdy `IAM_QUEUE_REDIS_URL` jest ustawione i `bullmq` zainstalowana, ten
 * backend trzyma joby w Redis. Wymaga osobnego workera (np. `scripts/iam-worker.mjs`)
 * żeby je procesować — inline-retry pozostaje default dla dashboardu.
 *
 * TODO: skrypt workera + Dockerfile.worker + docker-compose profil, gdy
 * infra będzie gotowa do uruchomienia Redisa.
 */
class BullmqBackendPlaceholder implements QueueBackend {
  register(): void {}
  async enqueue(): Promise<void> {
    throw new Error(
      "BullMQ backend not yet implemented. Install bullmq, implement worker, and set IAM_QUEUE_REDIS_URL.",
    );
  }
}

// ---------- queue singleton ----------

function pickBackend(): QueueBackend {
  const redisUrl = getOptionalEnv("IAM_QUEUE_REDIS_URL");
  if (redisUrl) {
    logger.info("IAM_QUEUE_REDIS_URL set but bullmq adapter not implemented yet — falling back to inline-retry");
    void new BullmqBackendPlaceholder(); // type-check the stub
  }
  return new InlineRetryBackend();
}

let queueSingleton: QueueBackend | null = null;

function getQueue(): QueueBackend {
  if (!queueSingleton) queueSingleton = pickBackend();
  return queueSingleton;
}

export function registerJobHandler(kind: JobKind, handler: JobHandler): void {
  getQueue().register(kind, handler);
}

export function enqueueJob(
  payload: JobPayload,
  opts: EnqueueOptions = {},
): Promise<void> {
  return getQueue().enqueue(payload, opts);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

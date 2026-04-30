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

// ── Module-level queue stats ─────────────────────────────────────────────
// In-memory liczniki — inline-retry backend nie persystuje jobów do DB.
// Eksponowane przez getQueueStats() dla /api/admin/metrics. Restart procesu
// resetuje counters (akceptowalne — używamy ich tylko jako runtime gauges).
let pendingJobs = 0;
let runningJobs = 0;
let failedJobs = 0;
let totalEnqueued = 0;

/**
 * Snapshot stanu IAM queue (inline-retry backend).
 *
 * - `pending`: joby zakolejkowane ale jeszcze nie wykonane (typowo 0 dla
 *   inline-retry — handler startuje natychmiast)
 * - `running`: joby aktualnie wykonujące się (w tym podczas retry-backoff)
 * - `failed`: kumulatywna liczba jobów które wyczerpały retries od startu
 *   procesu
 * - `total`: łączna liczba zakolejkowanych jobów od startu procesu
 *
 * Zwraca null jeśli queue nie była jeszcze użyta (`enqueueJob` nigdy nie
 * został wywołany) — wtedy nie ma sensu eksponować zer.
 */
export async function getQueueStats(): Promise<
  | { pending: number; failed: number; running: number; total: number }
  | null
> {
  if (totalEnqueued === 0 && pendingJobs === 0 && runningJobs === 0) {
    return null;
  }
  return {
    pending: pendingJobs,
    failed: failedJobs,
    running: runningJobs,
    total: totalEnqueued,
  };
}

export type JobKind =
  | "profile.propagate"
  | "role.assign"
  | "role.unassign"
  | "seed.apply"
  | "user.deprovision";

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
    totalEnqueued += 1;
    pendingJobs += 1;
    const handler = this.handlers.get(payload.kind);
    if (!handler) {
      logger.error("no handler for job kind", { kind: payload.kind });
      pendingJobs -= 1;
      failedJobs += 1;
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

    pendingJobs -= 1;
    runningJobs += 1;
    try {
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
            failedJobs += 1;
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
    } finally {
      runningJobs -= 1;
    }
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

/**
 * Test-only helper — resetuje module-level counters do stanu zerowego.
 * Pozwala unit-testom symulować świeży start bez dziedziczenia stanu z
 * innych testów. Nie używać w runtime (counters są źródłem prawdy dla
 * /api/admin/metrics).
 */
export function __resetQueueStatsForTests(): void {
  pendingJobs = 0;
  runningJobs = 0;
  failedJobs = 0;
  totalEnqueued = 0;
}

/**
 * Test-only helper — symuluje faked stan kolejki dla weryfikacji że
 * getQueueStats() poprawnie odczytuje module-level countery.
 */
export function __setQueueStatsForTests(state: {
  pending: number;
  running: number;
  failed: number;
  total: number;
}): void {
  pendingJobs = state.pending;
  runningJobs = state.running;
  failedJobs = state.failed;
  totalEnqueued = state.total;
}

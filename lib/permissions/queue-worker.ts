/**
 * Queue worker — standalone Node entrypoint dla `lib/permissions/queue.ts`.
 *
 * Cel: w środowisku gdzie `IAM_QUEUE_REDIS_URL` jest ustawione (BullMQ
 * backend), joby z kolejki ląduje w Redis i czeka na worker żeby je
 * zaprocesować. Dashboard sam jest tylko producerem — *konsumpcję* robi
 * ten proces.
 *
 * W obecnym kodzie `lib/permissions/queue.ts` jest jeszcze zdroved
 * (BullMQ backend = placeholder). Ten plik jest **forward-compatible
 * scaffold** — można go uruchomić już teraz z `inline-retry` backend
 * (no-op pętla, czeka na SIGTERM), a po faktycznym podpięciu BullMQ
 * subskrybuje kolejkę i procesuje joby.
 *
 * Lifecycle:
 *   1. Wczytaj env (LOG_LEVEL, DATABASE_URL, IAM_QUEUE_REDIS_URL).
 *   2. Bootstrap schema (`appendIamAudit` no-op call) żeby tabela
 *      `iam_audit_log` istniała przed pierwszym job-em.
 *   3. Zaimportuj sync.ts żeby wywołać `ensureHandlersRegistered()`
 *      (re-register handlerów dla queue).
 *   4. Loop: gdy backend = bullmq, czekaj na joby; gdy inline-retry,
 *      idle (worker nie potrzebny). 30s heartbeat log.
 *   5. SIGTERM/SIGINT: graceful shutdown (zaczekaj na current job,
 *      max 30s, potem hard exit 0).
 *
 * Run:
 *   node lib/permissions/queue-worker.js
 *
 * Dla TypeScript dev: `tsx lib/permissions/queue-worker.ts`.
 */

import { log } from "@/lib/logger";
import { getOptionalEnv } from "@/lib/env";
import { appendIamAudit, isIamDbConfigured } from "./db";

const logger = log.child({ module: "iam-queue-worker" });

let shuttingDown = false;
// currentJob reservation — przyszły hook do wstrzymywania mainLoop dopóki
// aktualny job nie skończy. Obecnie zawsze null (jobs są inline w mainLoop).
// W Faza 5+ enqueueJob/processJobs będzie async streaming → ten slot dostanie
// realny Promise z lifecycle managera.
const currentJob: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  logger.info("queue-worker booting", {
    nodeEnv: process.env.NODE_ENV,
    redisConfigured: Boolean(getOptionalEnv("IAM_QUEUE_REDIS_URL")),
    dbConfigured: isIamDbConfigured(),
  });

  // Step 1: ensure DB schema is initialised (audit table). appendIamAudit
  // wewnątrz wywoła ensureSchema → CREATE TABLE IF NOT EXISTS.
  if (isIamDbConfigured()) {
    try {
      await appendIamAudit({
        actor: "system:queue-worker",
        action: "worker.boot",
        targetType: "system",
        targetId: "queue-worker",
        payload: { startedAt: new Date().toISOString() },
        result: "success",
      });
      logger.info("audit schema ready");
    } catch (err) {
      logger.error("audit bootstrap failed (will continue, but jobs may not log)", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Step 2: import sync.ts żeby wymusić registerJobHandler() dla:
  //   - profile.propagate
  //   - role.assign
  //   - user.deprovision
  // Te handler-y są w sync.ts wewnątrz ensureHandlersRegistered() i
  // wywołują się gdy enqueueJob jest pierwszy raz callowany. Worker
  // też potrzebuje ich żeby procesować joby z Redis.
  //
  // Workaround: trigger handler registration przez import + lazy hack —
  // wywołujemy któryś z `enqueue*` z fake invalid args, ale lepiej dodać
  // dedykowaną funkcję `registerAllHandlers` w sync.ts. TODO:
  // implement dedicated export.
  try {
    // Import side-effect rejestruje handlery (eksportowane funkcje
    // `enqueue*` wywołują `ensureHandlersRegistered()`).
    await import("./sync");
    logger.info("sync.ts loaded — handlers ready do rejestracji per-call");
  } catch (err) {
    logger.error("sync.ts import failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    // Nie exitujemy — operator może mieć minimalny worker dla samego
    // BullMQ heartbeat. W produkcji ten error powinien być fatal.
  }
}

/**
 * Główna pętla. Gdy backend = bullmq, BullMQ Worker sam handluje pętlę
 * (tu byłby `new Worker(...)` na konkretną kolejkę). Gdy inline-retry,
 * worker nic nie robi — joby są procesowane synchronicznie w produkującym
 * procesie (dashboard).
 *
 * TODO: implement BullMQ Worker tutaj gdy `IAM_QUEUE_REDIS_URL` jest set
 * i lib `bullmq` zostanie dodana do dependencies.
 */
async function mainLoop(): Promise<void> {
  const redisUrl = getOptionalEnv("IAM_QUEUE_REDIS_URL");

  if (!redisUrl) {
    logger.warn(
      "IAM_QUEUE_REDIS_URL not set — using inline-retry backend, worker has nothing to do",
      {
        suggestion:
          "set IAM_QUEUE_REDIS_URL i zainstaluj bullmq żeby aktywować worker",
      },
    );
  } else {
    logger.info("BullMQ backend not yet implemented — worker idle", {
      redisUrl: redisUrl.replace(/:\/\/[^@]+@/, "://***@"),
    });
  }

  // Heartbeat co 30s. Robi 3 rzeczy:
  //   - dowodzi że proces żyje (Coolify healthcheck zaczepi się o stdout)
  //   - umożliwia odbiór sygnałów (Node nie blokuje na pure await)
  //   - place-holder dla faktycznej pętli BullMQ
  while (!shuttingDown) {
    logger.debug("queue-worker heartbeat", {
      uptime: process.uptime(),
    });
    await sleep(30_000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachShutdownHandlers(): void {
  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      logger.warn("second signal received — forcing exit", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("graceful shutdown initiated", { signal });

    // Zaczekaj na current job (max 30s). Po tym czasie hard-exit.
    if (currentJob) {
      logger.info("waiting for current job to finish (max 30s)");
      const timeout = sleep(30_000).then(() => "timeout");
      const winner = await Promise.race([
        currentJob.then(() => "done"),
        timeout,
      ]);
      logger.info("current job state at shutdown", { winner });
    }

    logger.info("queue-worker exit", { exitCode: 0 });
    process.exit(0);
  };

  process.on("SIGTERM", () => void handleSignal("SIGTERM"));
  process.on("SIGINT", () => void handleSignal("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException — exiting", { err: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection — exiting", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    process.exit(1);
  });
}

export async function runQueueWorker(): Promise<void> {
  attachShutdownHandlers();
  await bootstrap();
  await mainLoop();
}

// Direct invoke gdy ten plik jest entry-pointem (node lib/permissions/queue-worker.js).
// W bundli Next.js / vitest ten branch nigdy nie jest aktywny — `require` jest
// undefined w ESM bundler-mode, więc kompiluje się ten kod ale nie wykonuje.
//
// Używamy globalThis.process check + brak Next.js bundler markera — Next.js
// nie pozwala redeklarować `module` (zarezerwowane w jego CJS shim), więc
// zamiast `require.main === module` używamy heurystyki przez argv[1].
{
  const cjsModule = (globalThis as { module?: { filename?: string } }).module;
  const cjsRequireMain = (globalThis as { require?: { main?: { filename?: string } } })
    .require?.main;
  const isEntryPoint =
    typeof cjsModule !== "undefined" &&
    typeof cjsRequireMain !== "undefined" &&
    cjsRequireMain.filename === cjsModule.filename;
  if (isEntryPoint) {
    void runQueueWorker().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("queue-worker fatal", err);
      process.exit(1);
    });
  }
}

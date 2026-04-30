# MyPerformance — Queue Worker

Standalone proces Node który procesuje IAM jobs z `lib/permissions/queue.ts`. Wprowadzony jako osobny serwis Coolify żeby:

1. Heavy queue jobs (cascading delete, profile propagation do 6 providerów) nie blokowały request-cycle dashboardu.
2. Skalować consumera niezależnie od dashboardu (np. 3× queue-worker przy bulk operations, dashboard zawsze 1×).
3. Restart workera bez przerywania user sessions w dashboardzie.

## Status

**Forward-compatible scaffold.** Aktualnie `lib/permissions/queue.ts` używa backendu `inline-retry` (job procesuje się synchronicznie w producerze). Worker w tym setupie idle-loopuje (heartbeat co 30s) — nic nie konsumuje, ale proces jest gotowy do podpięcia BullMQ:

1. `npm install bullmq ioredis`
2. Implement BullMQ Worker w `lib/permissions/queue.ts` (BullmqBackend → real implementation, patrz `BullmqBackendPlaceholder`).
3. Implement subscriber w `lib/permissions/queue-worker.ts::mainLoop()` — `new Worker(queueName, async (job) => ...)`.
4. Set `IAM_QUEUE_REDIS_URL=redis://redis-queue:6379` w env tego serwisu.
5. Redeploy.

## Pliki

- [`docker-compose.yml`](./docker-compose.yml) — minimal deploy spec (1 service: `queue-worker`).
- [`../../Dockerfile.worker`](../../Dockerfile.worker) — multi-stage build, FROM node:22-alpine, entrypoint `node dist/lib/permissions/queue-worker.js`.
- [`../../lib/permissions/queue-worker.ts`](../../lib/permissions/queue-worker.ts) — entrypoint (bootstrap DB schema, register handlers, main loop, SIGTERM handler).

## Deployment via Coolify

### 1. Stwórz nowy Service w Coolify

1. Coolify dashboard → Project "myperformance" → New Resource → Docker Compose.
2. Source: GitHub repo `myperformance-service`, branch `main`, **Base Directory** `infrastructure/queue-worker`.
3. Build pack: Docker Compose.
4. Domains: brak (worker nie wystawia HTTP — heartbeat tylko w log-ach).
5. Network: attach do `myperformance_backend` (już external w compose'ie).

### 2. Skopiuj env z dashboardu

Worker potrzebuje tych samych secrets co dashboard:

```
DATABASE_URL=postgres://dashboard:<pass>@postgres-dashboard:5432/dashboard
KEYCLOAK_URL=https://auth.myperformance.pl
KEYCLOAK_REALM=MyPerformance
KEYCLOAK_SERVICE_CLIENT_ID=myperformance-service
KEYCLOAK_SERVICE_CLIENT_SECRET=<same as dashboard>
LOG_LEVEL=info
# Opcjonalnie po podpięciu BullMQ:
# IAM_QUEUE_REDIS_URL=redis://redis-queue:6379
```

W Coolify GUI → Environment Variables, **albo** przez API:

```bash
node scripts/iam-sync-oidc-secrets.mjs  # wzorzec; analogicznie dla worker UUID
```

### 3. Deploy + verify

```bash
# W Coolify GUI: Deploy
# Sprawdź logi:
docker logs myperformance_queue_worker --tail 50
# Oczekiwany output:
#   {"level":"info","message":"queue-worker booting",...}
#   {"level":"info","message":"audit schema ready",...}
#   {"level":"info","message":"sync.ts loaded — handlers ready do rejestracji per-call",...}
#   {"level":"warn","message":"IAM_QUEUE_REDIS_URL not set — using inline-retry backend, worker has nothing to do",...}
# (Heartbeat co 30s — `queue-worker heartbeat` przy LOG_LEVEL=debug.)
```

Healthcheck Coolify oparty o `pgrep -f queue-worker` w kontenerze — gdy proces żyje, status = healthy.

## Rollback

Worker jest stateless — można go zatrzymać (`docker stop myperformance_queue_worker`) bez utraty danych. W obecnym setupie (inline-retry) dashboard nadal procesuje joby sam, więc zatrzymanie workera = brak skutku.

Po przejściu na BullMQ, zatrzymanie workera = joby leżą w Redis aż worker wstanie. Coolify auto-restart (max 5 attempts, 120s window) zwykle wystarczy.

## Monitoring

- **Coolify Logs** → tab `Logs`, filter `level:error` żeby zobaczyć failed jobs.
- **Wazuh** — workspace ma rule na `iam_audit_log.result=failure` (już skonfigurowane).
- **Dashboard** — `/admin/infrastructure` pokazuje audit log entries z `actor=system:queue-worker`.

## Troubleshooting

- **`queue-worker fatal` przy starcie**: brak `DATABASE_URL` lub `KEYCLOAK_*`. Sprawdź env w Coolify GUI.
- **Worker idle przez >24h**: oczekiwane gdy `IAM_QUEUE_REDIS_URL` puste. Po podpięciu BullMQ heartbeat zostanie zastąpiony aktywnym job processing.
- **Container restartuje się w pętli**: prawdopodobnie tsc build w Dockerfile.worker failuje. Sprawdź `docker logs myperformance_queue_worker --tail 200`. Worker nie wymaga pełnego Next.js build — tylko skompilowanych modułów `lib/`.

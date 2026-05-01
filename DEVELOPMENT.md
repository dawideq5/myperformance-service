# Środowisko deweloperskie

## TL;DR

```bash
cd /Users/dawidpaluska/myperformance-service/myperformance-service
npm install            # tylko raz
npm run dev            # dashboard + lokalna baza
npm run dev:panels     # j.w. + panele 3001/3002/3003
```

Dashboard: <http://localhost:3000> · logowanie przez `auth.myperformance.pl`.

## Co robi `npm run dev`

`scripts/dev-hybrid.sh` orchestruje pełne lokalne środowisko:

1. Sprawdza Docker Desktop, startuje **lokalną Postgres** w kontenerze
   `myperformance_postgres_dev` (port `5433`, baza `myperformance_dev`).
   Schema bootstrapuje się automatycznie przy pierwszym zapytaniu —
   moduły w `lib/*` używają `CREATE TABLE IF NOT EXISTS`.
2. Czeka na `pg_isready` (max 30s).
3. Ładuje `.env.hybrid` + nadpisuje sekrety z `.env.local`.
4. Wymusza `DATABASE_URL=postgres://mp_dev:mp_dev_local@localhost:5433/...`
   oraz `DEV_CERT_BYPASS=true`.
5. Startuje Next.js dashboard na `:3000`.

Z flagą `--panels` dodatkowo startuje trzy panele Next.js (`sprzedawca`/
`serwisant`/`kierowca`) na portach `3001`/`3002`/`3003`. Subprocesy
dostają `DEV_CERT_BYPASS=true` inline, więc mTLS gating jest wyłączony.

## Polecenia

| Komenda | Co robi |
| --- | --- |
| `npm run dev` | Dashboard + lokalna baza |
| `npm run dev:panels` | Dashboard + panele 3001-3003 |
| `npm run dev:bare` | Tylko `next dev` (zakłada że baza już działa) |
| `npm run dev:db` | Tylko Postgres w Dockerze (bez dashboardu) |
| `npm run dev:db:stop` | Zatrzymanie Postgresa |
| `npm run dev:db:reset` | Wycięcie volume + restart (świeża baza) |
| `npm run dev:webhooks` | Tunel publiczny dla webhooków (cloudflared) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run deploy` | Test → build → git push → Coolify deploy |

## Zewnętrzne usługi w trybie dev

Usługi takie jak Documenso, Postal, Chatwoot, Moodle używają w
produkcji **Docker-internal hostnames** (`database-c9d...`,
`mariadb-iut9w...`). Z lokalnej maszyny te hosty nie są resolvowalne —
nie tunelujemy ich. `lib/db.ts::withExternalClient` wykrywa pierwszy
fail (ENOTFOUND/ECONNREFUSED), oznacza pool jako disabled i kolejne
calle rzucają lekki `ExternalServiceUnavailableError` zamiast
spamować logi. Endpointy które ich potrzebują zwrócą 503 — to OK
lokalnie.

Co działa lokalnie out-of-the-box:

- Logowanie przez Keycloak (`auth.myperformance.pl`)
- Directus (`cms.myperformance.pl`)
- Postal SMTP relay przez publiczny endpoint
- Pełny IAM/permissions/security stack (lokalna Postgres)
- Panele z mTLS-bypass

Co wymaga prod-sieci (degraduje gracefully):

- Bezpośrednie zapytania do Documenso/Postal/Chatwoot/Moodle DB
- Webhook delivery (użyj `npm run dev:webhooks` żeby wystawić tunel)

## Wdrożenie produkcyjne

```bash
npm run deploy
```

`scripts/promote-to-prod.sh` uruchamia: `npm run test` → `npm run
build` → `git push origin <branch>` → trigger Coolify deploy →
poll status do `finished`/`failed`.

## Pełen stack offline (rzadko)

Jeśli musisz pracować offline lub odtworzyć całe SSO lokalnie:

```bash
docker compose -f docker-compose.dev.full.yml up -d --build
```

Uruchomi Keycloak/Directus/Postal/etc. lokalnie (zajmie kilka minut
i ~6 GB RAM).

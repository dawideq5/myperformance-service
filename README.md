# MyPerformance Dashboard

Single-sign-on dashboard dla ekosystemu MyPerformance. Next.js 15 (App Router) +
NextAuth z Keycloak jako Identity Provider i **jedynym źródłem prawdy** o
użytkownikach, rolach i uprawnieniach.

## Architektura

```
                      ┌──────────────────────────┐
                      │        Keycloak          │  ← Source of Truth
                      │  (realm: MyPerformance)  │     users · roles · groups
                      └─────────────┬────────────┘
                                    │  OIDC / Admin REST
                ┌───────────────────┼────────────────────┐
                │                   │                    │
     ┌──────────▼──────────┐   ┌────▼────┐   ┌───────────▼──────────┐
     │   Dashboard (ten    │   │ Native  │   │  Panele cert-gated   │
     │    serwis)          │   │  apps   │   │ (sprzedawca /        │
     │  — /admin/users     │   │ Chatwoot│   │  serwisant /         │
     │  — /admin/templates │   │ Moodle  │   │  kierowca)           │
     │  — /admin/certs     │   │ Postal  │   │  mTLS + role KC      │
     └─────────────────────┘   │ Directus│   └──────────────────────┘
                               │ Documenso│
                               │ Outline │
                               └─────────┘
```

### Kluczowe zasady

1. **Keycloak trzyma tożsamość i role**. Każda aplikacja startuje od OIDC
   userinfo — nie cache'uje profilu dłużej niż TTL tokena.
2. **Role są wersjonowane w kodzie** (`lib/permissions/areas.ts`) i seedowane
   do Keycloaka. Nie da się dodać roli wyłącznie w KC bez wpisu w katalogu.
3. **Precyzyjne przypisywanie per panel**: każdy „area" (Chatwoot, Moodle,
   Documenso, panele cert-gated itd.) ma listę dopuszczalnych ról i wymuszoną
   zasadę **0..1 roli per user** — user nie może mieć jednocześnie
   `chatwoot_agent` i `chatwoot_administrator`.
4. **Sync do aplikacji natywnych**: tam, gdzie aplikacja nie umie czytać ról
   z OIDC (Moodle, Postal, Chatwoot, Documenso, Directus, Outline), ich
   natywne role są **propagowane** z Keycloaka do bazy/API aplikacji przez
   `lib/permissions/sync.ts`. Źródłem prawdy pozostaje Keycloak — sync
   odtwarza stan, nie tworzy go.

### Rejestr obszarów (areas)

Pełna lista w `lib/permissions/areas.ts`. Skrót:

| Area | Provider | Role KC (seed) | Notatki |
|---|---|---|---|
| `chatwoot` | native | `chatwoot_agent`, `chatwoot_administrator` | omnichannel obsługa klienta |
| `moodle` | native | `moodle_student`, `moodle_editingteacher`, `moodle_manager` | LMS Akademia |
| `directus` | native | `directus_admin` | CMS |
| `documenso` | native | `documenso_user`, `documenso_handler`, `documenso_admin` | e-signing |
| `knowledge` | native | `knowledge_viewer`, `knowledge_user`, `knowledge_admin` | Outline wiki |
| `postal` | native | `postal_user`, `postal_admin` | mail platform |
| `stepca` | KC only | `certificates_admin`, `stepca_admin` | PKI |
| `keycloak` | KC only | `keycloak_admin` | konsola IdP |
| `kadromierz` | KC only | `kadromierz_user` | grafik pracy |
| `panel-sprzedawca` | KC only | `sprzedawca` | cert-gated panel |
| `panel-serwisant` | KC only | `serwisant` | cert-gated panel |
| `panel-kierowca` | KC only | `kierowca` | cert-gated panel |
| `admin` | KC only | `keycloak_admin` | gate dla `/admin/*` |
| `core` | KC only | `app_user` | default-roles |

### Zarządzanie użytkownikami

- **`/admin/users`** — lista użytkowników + przypisywanie ról per obszar.
  Całe UI operuje na Keycloak Admin API (`lib/keycloak-admin.ts`). Nie ma
  lokalnej tabeli użytkowników — nigdzie w bazie nie trzymamy duplikatów.
- **`/admin/users/[id]`** — profil + reset hasła + forced-actions +
  sesje + integracje + area-roles.
- **`/admin/templates`** — szablony ról. Szablony leżą w atrybutach realmu KC
  (`mp.role_templates`), nie w lokalnej bazie. Przy zaproszeniu można od razu
  zaaplikować szablon.
- **`/admin/keycloak`** — redirect do natywnej konsoli Keycloak (dla operacji,
  których panel nie udostępnia: realmy, klienci, IdP, polityki haseł).
- **`/admin/certificates`** — wydawanie certyfikatów mTLS dla paneli
  cert-gated.

### Dostęp RBAC w tokenie

Role z tokena JWT Keycloak:

- `realm_access.roles[]` — realm roles
- `resource_access.{clientId}.roles[]` — client roles

Realm-admin roles (`realm-admin`, `manage-realm`, `admin`) implikują pełny
dostęp bez potrzeby explicit przypisywania każdej funkcjonalnej roli.

## Wymagania środowiskowe

Skopiuj `.env.example` do `.env`. Minimum do startu:

```bash
cp .env.example .env
```

Zmienne środowiskowe — najważniejsze:

| Zmienna | Opis |
|---|---|
| `NEXTAUTH_URL` | Publiczny URL aplikacji |
| `NEXTAUTH_SECRET` | Sekret NextAuth (wygeneruj `openssl rand -base64 64`) |
| `KEYCLOAK_URL` | Base URL Keycloaka |
| `KEYCLOAK_REALM` | Realm (domyślnie `MyPerformance`) |
| `KEYCLOAK_ISSUER` | Pełny issuer (alternatywa dla URL+REALM) |
| `KEYCLOAK_CLIENT_ID` | Client ID |
| `KEYCLOAK_CLIENT_SECRET` | Client secret |
| `KEYCLOAK_SERVICE_CLIENT_ID` | Client dla Admin API (service account) |
| `KEYCLOAK_SERVICE_CLIENT_SECRET` | Secret service-accounta |
| `KEYCLOAK_WEBHOOK_SECRET` | Sekret dla webhooku KC → backchannel logout |
| `LOG_LEVEL` | `debug`/`info`/`warn`/`error` (domyślnie `info` w prod) |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | URL dla email-linków / integracji |

Pełna lista w `.env.example`.

## Instalacja i uruchomienie

```bash
npm ci            # instalacja (respektuje .npmrc)
npm run dev       # dev server na :3000
npm run typecheck # tsc --noEmit
npm run lint      # next lint
npm test          # vitest (unit testy: admin-auth, areas, logger)
npm run build     # produkcyjny build
```

Budowanie motywu Keycloak (Keycloakify + Maven):

```bash
npm run build-keycloak-theme
npm run dev:keycloak-theme
```

## CI / Bezpieczeństwo

- `.github/workflows/ci.yml` — lint + typecheck + test + build + `npm audit`
  na każdy PR/push do `main`.
- Produkcyjne `npm audit` musi być czyste (poziom `high` blokuje merge).
- `tsconfig.strict: true` — włączony strict mode.
- Wszystkie `/api/admin/*` za auth guardem `keycloak_admin` + middleware
  wymusza same-origin (CSRF defense-in-depth).
- Strukturalny logger (`lib/logger.ts`) — NDJSON z `requestId` przez
  `AsyncLocalStorage` (`lib/request-context.ts`). Middleware generuje i
  zwraca nagłówek `X-Request-Id` — per-request korelacja w Loki/Coolify.
- Webhooki fail-closed gdy brak sekretu; weryfikacja przez
  `crypto.timingSafeEqual`.

## Struktura projektu

```
├── app/
│   ├── admin/                   — zakładki administracyjne (KC-backed)
│   │   ├── users/               —   zarządzanie userami + role per area
│   │   ├── templates/           —   szablony ról
│   │   ├── certificates/        —   mTLS certs dla paneli cert-gated
│   │   └── keycloak/            —   redirect do konsoli KC
│   ├── api/
│   │   ├── admin/               — Admin REST (wymaga `keycloak_admin`)
│   │   ├── account/             — self-service (wymaga zalogowania)
│   │   ├── auth/[...nextauth]/  — NextAuth handler
│   │   ├── integrations/        — Google / Moodle / Kadromierz
│   │   ├── calendar/            — kalendarz (local + Google + Moodle)
│   │   └── webhooks/            — KC backchannel / Google Calendar
│   ├── dashboard/               — główna siatka tile'ów (role-gated)
│   ├── account/                 — self-service profil + security
│   └── auth.ts                  — NextAuth + Keycloak provider
├── lib/
│   ├── admin-auth.ts            — RBAC helpers (client-safe via api-errors)
│   ├── api-errors.ts            — ApiError klasa (client-safe)
│   ├── api-utils.ts             — server-only: handleApiError + logger
│   ├── keycloak.ts              — KC OIDC + Admin API wrapper
│   ├── keycloak-admin.ts        — helper: service-account + user-id ctx
│   ├── permissions/
│   │   ├── areas.ts             — rejestr obszarów + role per area
│   │   ├── registry.ts          — rejestr providerów natywnych
│   │   ├── sync.ts              — propagacja KC → natywne apps
│   │   └── providers/*          — Postal/Moodle/Chatwoot/Directus/Documenso/Outline
│   ├── role-templates.ts        — szablony ról w atrybutach realmu KC
│   ├── logger.ts                — NDJSON logger (z requestId)
│   ├── request-context.ts       — AsyncLocalStorage dla requestId
│   └── rate-limit.ts            — in-memory token bucket
├── middleware.ts                — edge auth + role guards + same-origin + request-id
├── .github/workflows/ci.yml     — CI pipeline
├── vitest.config.ts             — vitest config
└── infrastructure/
    └── keycloak/                — realm.json + DEPLOYMENT.md
```

## Role w tokenie — lista kanoniczna

Role katalogowane w `lib/admin-auth.ts` (`ROLES`) i seedowane do Keycloaka
przez `scripts/seed-area-roles.mjs` (na podstawie `lib/permissions/areas.ts`).
Pełna referencja w rejestrze areas.

## Docker

```bash
docker build -t myperformance-dashboard .
docker run -p 3000:3000 --env-file .env myperformance-dashboard
```

Obraz: multi-stage, non-root `nextjs:nodejs` (uid 1001), `tini` init, HTTP
healthcheck.

## Wdrożenie Keycloak / theme na produkcję

Instrukcja krok po kroku (build JAR-a, deploy do `/opt/keycloak/providers/`,
migracja ról, aktywacja `loginTheme=myperformance`) — zobacz
[`infrastructure/keycloak/DEPLOYMENT.md`](infrastructure/keycloak/DEPLOYMENT.md).

## Skrypty operacyjne

Wszystkie skrypty produkcyjne w `scripts/`. Dev-only / scratch w `scripts/dev/`.

### Aktywne (prod)

| Skrypt | Co robi | Bezpieczne dla prod | Idempotentny |
|---|---|---|---|
| `keycloak-seed.mjs` | Seed realm: clients + role + grupy + composite roles | TAK | TAK |
| `seed-area-roles.mjs` | Seed realm roles z `lib/permissions/areas.ts` | TAK | TAK |
| `directus-seed-clients.mjs` | Seed Directus collection `mp_app_catalog_cms` | TAK | TAK |
| `sync-all-users.mjs` | Bulk KC → native apps user/role sync | TAK | TAK |
| `iam-verify.mjs` | Audit consistency KC vs code (provider readiness) | TAK | n/a (read-only) |
| `iam-sync-oidc-secrets.mjs` | Propagacja OIDC secret z KC → Coolify env per app | TAK | TAK |
| `coolify-deploy.sh` | Trigger Coolify redeploy przez API | TAK | TAK |
| `coolify-deploy-keycloak-theme.sh` | Build + push KC theme JAR + redeploy | TAK | TAK |
| `apply-realm-changes.sh` | Import realm.json z `infrastructure/keycloak/` | TAK | TAK |
| `update-mtls-bundle.sh` | Wyciąga CA certs z step-ca → Traefik certs dir + HUP | TAK | TAK |
| `postal-propagate-smtp.mjs` | Push SMTP creds z Postal do wszystkich Coolify env | TAK | TAK |
| `stepca-oidc-setup.mjs`, `stepca-add-oidc.sh` | OIDC provisioner config dla step-ca | TAK | TAK |
| `render-traefik-config.sh` | Render `wazuh-webhook.yml.template` z $COOLIFY_DASHBOARD_UUID | TAK | TAK |
| `ovh-rotate-keys.mjs` | Interaktywna rotacja OVH app/consumer keys + Coolify env update + redeploy | TAK | częściowo (krok 2 generuje nowy CK) |

### Migracje (one-off, post-2026-04 historia)

W `scripts/migrations/`:

| Skrypt | Co robi | Status |
|---|---|---|
| `kc-enforce-mfa-for-admins.mjs` | Ustawia CONFIGURE_TOTP requiredAction dla userów z rolą admin | NOWY (Faza 0) |
| `keycloak-delete-legacy-roles.mjs` | Usunięcie obsolete realm roles | wykonane 2026-04-24 |
| `migrate-roles-2026-04.mjs` | Rename ról: documenso_user → member, etc. | wykonane 2026-04-24 |
| `migrate-single-role-per-area.mjs` | Wymuszenie 0..1 roli per area na każdym userze | wykonane 2026-04-24 |
| `rename-kc-roles.mjs` | Generic rename helper | wykonane 2026-04-24 |
| `migrate-roles-simplify.mjs` | Documenso/Outline 3-tier consolidation | wykonane 2026-04-24 |

### Dev-only (NIE uruchamiać w prod)

W `scripts/dev/`:

| Skrypt | Co robi | Kontekst |
|---|---|---|
| `macbook-backup-pull.sh` | rsync backup z VPS na lokalny MacBook | local backup poza S3 |
| `macbook-restore.sh` | Restore z lokalnego backup | disaster recovery dev |
| `macbook-setup.md` | Setup LaunchAgent dla auto-pull co 6h | dokumentacja |
| `seed-directus-public-photos.mjs` | Wgrywa stock photos do Directus | one-shot dev setup |
| `chatwoot-bootstrap-platform-app.sh` | Bootstrap Platform App w Chatwoot | non-idempotent |

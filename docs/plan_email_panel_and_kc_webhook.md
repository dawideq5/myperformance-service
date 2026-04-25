# Plan: Email panel + KC webhook delete

**Data:** 2026-04-25
**Cel:** (1) webhook-driven cascading delete user-a (KC = source of truth, real-time), (2) panel `/admin/email` z kontrolą template'ów, brandingiem, zarządzaniem Postal.

---

## Część 1 — KC webhook → cascading delete

### Założenia (audyt)

- Keycloak realm MA `eventsEnabled: true`, `adminEventsEnabled: true` — eventy są generowane.
- `eventsListeners: []` — żaden listener nie wysyła ich na zewnątrz.
- KC providers dir (`/opt/keycloak/providers/`) ma tylko `myperformance-theme.jar`.
- Built-in HTTP webhook listener Keycloak ma tylko w EE. Open-source rozwiązanie: **`io.phasetwo.keycloak:keycloak-events`** (production-grade, MIT).

### Decyzja: Phasetwo SPI + dashboard webhook receiver

Wybór: **phasetwo `keycloak-events`** zamiast custom SPI (mniej kodu Java do utrzymania) i zamiast pollingu (real-time).

### Implementacja

1. **Pobranie + deploy SPI:**
   - Wrzucamy `event-listener-http-X.Y.Z.jar` (lub `keycloak-events-X.Y.Z.jar`) do `/opt/keycloak/providers/` na hoście.
   - Wymaga `kc.sh build` (rebuild z `--optimized`). Coolify: edytuj env (np. `KC_REBUILD_TRIGGER=v2`) i redeploy.
2. **Konfiguracja realm:**
   - Włącz listener przez Admin API: `PUT /realms/MyPerformance` z `eventsListeners: ["ext-event-webhook"]`.
   - Dodaj webhook subscription: `POST /realms/MyPerformance/webhooks` z `{ url, secret, eventTypes: ["admin.DELETE_USER", "access.UPDATE_EMAIL", ...] }`.
3. **Endpoint `/api/admin/webhooks/keycloak/route.ts`:**
   - Verify HMAC signature (header `X-Keycloak-Signature` = HMAC-SHA256(body, webhook_secret)).
   - Skip bez sesji-only: webhook to **public endpoint** (KC → dashboard) — żadnego `requireAdminPanel`. Ale guarded HMAC.
   - Whitelist po IP (KC container address range) jako defense-in-depth.
   - Parse event:
     - `admin.DELETE_USER` → wywołaj `enqueueUserDeprovision({email})` (email pobrany z event details lub via KC Admin API przed delete; phasetwo wysyła pre-event).
     - `admin.UPDATE_EMAIL` → `enqueueProfilePropagation` (już istnieje).
4. **Dashboard middleware:**
   - Endpoint `/api/admin/webhooks/*` musi być wyłączony z `requireAdminPanel` i z same-origin check w middleware.
5. **Audit:**
   - Każdy webhook event zapisywany do `mp_iam_audit` jako `operation: webhook.received`.
6. **Reconcile zachowane** — polling `/api/admin/sync/reconcile-users` jako defense-in-depth gdy webhook się zgubi.

### Risks

- KC redeploy resetuje providers gdyby JAR był wpięty inaczej — Coolify ma persistent volume `/opt/keycloak/providers` zazwyczaj OK.
- Phasetwo SPI version compatibility z KC 26.6.1 — sprawdzić release notes; tag `26.x` powinien istnieć.

---

## Część 2 — Email panel `/admin/email`

### Założenia (audyt)

| Aplikacja | Co wysyła? | Edycja template'u | Edycja przez API? |
|-----------|------------|-------------------|---------------------|
| **Keycloak** | verify-email, reset-password, executable-action, email-update, IdP-link | FreeMarker `themes/*/email/*.ftl` + `messages_pl.properties` | Częściowo: localization API (subjecty) + custom email theme JAR (treści) |
| **Documenso** | sign request, signed, reminder, invitation, password-reset | React Email TSX w source | Nie — wymaga forka/hot-replace |
| **Chatwoot** | nowa wiadomość, agent assigned, password-reset | Rails ERB + `config/locales/*.yml` | Częściowo: ENV `INSTALLATION_NAME`, `BRAND_URL` |
| **Moodle** | rejestracja, reset-password, course enrollment, grading | Język strings (`/admin/tool/customlang`) | Tak: `tool_customlang_utils` lub direct DB |
| **Outline** | invitation, document-share, mention | React templates w source | Nie — wymaga forka |
| **Directus** | password-reset, invitation | EJS w `extensions/` lub built-in | Nie domyślnie |
| **Postal** | (own admin notifications only) | Built-in | Nie |
| **Dashboard** | cert delivery, invitation | React (custom) | Tak — w naszym repo |

### Realna kontrola treści emaili — phased

#### Phase B (UI shell): nawigacja `/admin/email`

```
/admin/email
├── Postal     — serwery, skrzynki, route-y, sender names, DKIM
├── Branding   — globalne zmienne (brand name, logo, kolor) → propagacja do apek
├── Keycloak   — edytor lokalizacji (subjecty + body) + theme regen
├── Catalog    — inventory wszystkich emaili (read-only) + linki "Edit in app"
└── Test send  — wyślij testowy email z dowolnym template'em do testowego adresu
```

UI: standardowy layout dashboardu (PageShell + Tabs), zgodny z `/admin/users`, `/admin/certificates`.

#### Phase C: Postal management

**Mechanizm:** direct MariaDB (Postal nie ma admin API). Provider `lib/postal-admin.ts` (osobny od istniejącego `lib/permissions/providers/postal.ts`):
- `listOrganizations()` / `createOrganization()`
- `listServers(orgId)` / `createServer(orgId, name, mode=Live|Development)`
- `listCredentials(serverId)` / `createCredential(serverId, type=SMTP|API, key=...)` (auto-generates key)
- `listRoutes(serverId)` / `createRoute(serverId, name, domainId, endpoint=accept|reject|...)`
- `listDomains(orgId|serverId)` / `addDomain(orgId, domain)` + DNS check (DKIM/SPF/MX) widoczny w UI
- `getServerSenderConfig(serverId)` / `updateServerSenderConfig(serverId, { fromName, replyTo, ... })`

UI:
- Tabela serwerów z statusem (queue depth, last activity)
- Form tworzenia: org → server → credential
- Sekcja DNS: pokazuje wymagane rekordy (TXT DKIM, SPF, MX dla bounce) z copy-button

#### Phase D: Branding propagation

**Globalne zmienne (zapisywane w naszej DB `mp_branding`):**
- `brandName` (string)
- `brandUrl` (string)
- `brandLogoUrl` (string)
- `primaryColor` (hex)
- `supportEmail` (string)
- `legalName` (string)

**Propagation map (per app):**

| App | Coolify env keys |
|-----|------------------|
| KC | `KC_HOSTNAME_*`, realm display name (przez Admin API) |
| Documenso | `NEXT_PUBLIC_BRANDING_BRAND_NAME`, `NEXT_PUBLIC_BRANDING_BRAND_LOGO`, `NEXT_PUBLIC_BRANDING_BRAND_URL`, `NEXT_PUBLIC_BRANDING_BRAND_COLOR` |
| Chatwoot | `INSTALLATION_NAME`, `BRAND_URL`, `LOGO_THUMBNAIL_URL` |
| Moodle | `MOODLE_SITE_NAME` (env) + theme settings via DB |
| Outline | `BRAND_NAME` (jeśli istnieje), default site config |
| Directus | `PROJECT_NAME`, `PROJECT_LOGO`, `PROJECT_COLOR` |
| Dashboard | własne env |

**UI:** form z polami + button "Zastosuj wszędzie". Backend: PATCH każdego env w Coolify + trigger deploy. Audit log per-app status.

#### Phase E: KC localization editor

**Mechanizm:**
1. Włącz `internationalizationEnabled: true` w realm + supported locale `pl`.
2. Dla każdego znanego klucza (catalog 30+ keys: `emailVerificationSubject`, `emailVerificationBodyHtml`, `passwordResetSubject`, ...) UI pokazuje aktualną wartość (z `messages_pl.properties` jako default) + textarea editor.
3. Save → `PUT /realms/MyPerformance/localization/pl/{key}` z customową wartością.
4. Override znika gdy klikniesz "Reset to default" (DELETE).

**Limitations:**
- Tylko proste string-template (nie FreeMarker logic).
- HTML content zapisywany jako string — KC podstawi w `body.ftl` (dla customizacji struktury HTML wymagany custom theme).
- Lista znanych kluczy z `keycloak/services/.../messages_pl.properties` (hardcoded w `lib/kc-email-keys.ts`).

#### Phase F: Email catalog

Statyczna tabela (z manualnego audytu, w pliku `lib/email-catalog.ts`):

```ts
[
  {
    app: "keycloak",
    id: "emailVerification",
    name: "Weryfikacja adresu email",
    trigger: "Po rejestracji / zmianie emaila",
    variables: ["user.firstName", "user.email", "link", "linkExpiration"],
    attachments: [],
    editable: { kind: "kc-localization", keys: ["emailVerificationSubject", "emailVerificationBodyHtml"] },
  },
  // ... ~25 entries
]
```

UI: tabela ze szczegółami + button "Edytuj" prowadzący do odpowiedniego sub-panelu (KC localization / Branding / link do source).

#### Phase G (optional, future): Email gateway

Pełny enterprise: każda apka konfigurowana SMTP-relay przez nasz dashboard.
- Dashboard otwiera SMTP daemon (np. `smtp-server` npm).
- Apki ustawiają `SMTP_HOST=dashboard:2525`.
- Dashboard: parse incoming email → match template po sender + subject pattern → renderuj własny template z naszej DB → forward to Postal.
- Wymaga osobnej pracy (~2 tygodnie). Pominięte w MVP.

### Schema DB (nowe tabele)

```sql
-- Globalne branding settings
CREATE TABLE mp_branding (
  id smallint PRIMARY KEY DEFAULT 1, -- singleton
  brand_name text NOT NULL DEFAULT 'MyPerformance',
  brand_url text,
  brand_logo_url text,
  primary_color text,
  support_email text,
  legal_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Custom KC localization overrides
CREATE TABLE mp_kc_localization (
  locale text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (locale, key)
);

-- Postal admin audit (separate from existing iam audit — different domain)
CREATE TABLE mp_postal_audit (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  operation text NOT NULL, -- e.g. 'org.create', 'server.update', 'route.delete'
  target_type text,
  target_id text,
  status text NOT NULL,    -- 'ok' | 'error'
  details jsonb,
  error text
);
```

### API endpoints

```
# Webhook
POST   /api/admin/webhooks/keycloak          (HMAC-protected, public)

# Postal
GET    /api/admin/postal/organizations
POST   /api/admin/postal/organizations
GET    /api/admin/postal/servers
POST   /api/admin/postal/servers
PATCH  /api/admin/postal/servers/[id]
DELETE /api/admin/postal/servers/[id]
GET    /api/admin/postal/servers/[id]/credentials
POST   /api/admin/postal/servers/[id]/credentials
GET    /api/admin/postal/servers/[id]/routes
POST   /api/admin/postal/servers/[id]/routes
GET    /api/admin/postal/domains
POST   /api/admin/postal/domains

# Branding
GET    /api/admin/branding
PUT    /api/admin/branding
POST   /api/admin/branding/propagate         (push to all apps)

# KC localization
GET    /api/admin/email/kc-templates         (list known keys + current values)
PUT    /api/admin/email/kc-templates/[key]   (save override)
DELETE /api/admin/email/kc-templates/[key]   (reset to default)

# Catalog (static for now)
GET    /api/admin/email/catalog

# Test send
POST   /api/admin/email/test-send            ({ to, templateId, vars })
```

### UI route

```
app/admin/email/
├── page.tsx                    (server: load branding, load catalog stub)
├── EmailClient.tsx             (client: tabs)
├── postal/
│   ├── ServersPanel.tsx
│   ├── DomainsPanel.tsx
│   └── ServerDetail.tsx
├── branding/
│   └── BrandingPanel.tsx
├── keycloak/
│   └── KcLocalizationPanel.tsx
└── catalog/
    └── CatalogPanel.tsx
```

### Permissions

Cały panel pod `requireAdminPanel` + dodatkowy area-role `email_admin` (do zdefiniowania w `lib/permissions/areas.ts`). Bez tej roli — 403.

---

## Plan kolejności wdrożenia

1. **Phase A** (1 commit): KC webhook receiver endpoint + middleware bypass + reconcile zachowany. SPI deploy w KC realm — instrukcja manualna w PR (wymaga restartu KC).
2. **Phase B** (1 commit): UI shell `/admin/email` + tabs + skeletons.
3. **Phase C** (1-2 commity): Postal management — direct DB CRUD + UI.
4. **Phase D** (1 commit): Branding form + propagation + audit.
5. **Phase E** (1 commit): KC localization editor.
6. **Phase F** (1 commit): Catalog + test-send.

Po każdej phase: commit, push, deploy, smoke-test.

### Out of scope (na potem)

- Per-template editor dla Documenso/Outline/Chatwoot (wymaga forku albo hot-replace plików).
- Email gateway (SMTP relay przez dashboard).
- A/B testing template'ów.
- Dynamic attachments builder (w MVP attachments są tylko jako wskazania w catalog: "auto-generated PDF z modułu X").

---

## Decyzje do potwierdzenia przez użytkownika (BEFORE start)

1. **KC SPI deploy**: phasetwo wymaga rebuild KC (`kc.sh build`) i restart. Czy OK na ~2 min downtime?
2. **DB schema**: nowe 3 tabele w bazie dashboardu (postgres). Migracja w `db/migrations/` — OK?
3. **Branding propagation**: po zmianie redeploy 6 apek (~5-10 min każdy, asynchronicznie). User confirmation modal przed apply?
4. **Scope**: czy MVP B-F wystarczy, czy musi też być per-template editor dla Documenso? (ten ostatni = ~1 tydzień extra pracy z forkiem).

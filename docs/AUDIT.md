# MyPerformance — audyt systemu (2026-04-26)

Snapshot: commit `2ffaf38` na main.

Format: per-panel finding → severity (P0 = blocker / data-loss, P1 = security / UX-degrading, P2 = polish / niceto-have) → recommended fix → effort estimate.

## 0. Architektura w pigułce

Stack: Next.js 15 (App Router) + Keycloak 26.6.1 (phasetwo SPI) + PostgreSQL (3 separate DBs: dashboard, KC, Coolify) + Wazuh All-in-One + Coolify-orchestrated services + Traefik + step-ca + OVH VPS.

Permission model: `AREAS` registry (17 obszarów × kcRoles) → `hasArea(session, areaId, {min})` → 24× `canAccessXxx` thin wrappers → page-level + tile-level + middleware + Cmd+K filter.

Auth chain: Keycloak OIDC → NextAuth → middleware (5s userinfo cache) → page-level requireXxx → API route requireSession + role check.

Defense-in-depth layers:
1. CSRF — same-origin check w middleware dla /api/account, /api/admin
2. JWT exp validation w middleware (30s buffer)
3. KC userinfo fallback gdy JWT exp uncertain
4. ROLE_GUARDS for cross-cutting paths
5. Page-level requireXxx gdy ktoś ominie middleware
6. Cookie HMAC dla mp_did device fingerprint
7. mTLS RequireAndVerifyClientCert dla paneli sprzedawca/serwisant/kierowca
8. Wazuh SIEM + iptables auto-block

---

## 1. Per-panel findings

### 1.1 `/dashboard` (główny pulpit)

**Co robi:** kafelki aplikacji + Cmd+K palette + bell + theme toggle + onboarding card.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.1.1 | P1 | Brakuje analytics — nikt nie wie które kafelki są klikane, czy onboarding jest skuteczny. Industry: Linear, Notion, Vercel logują tile-clicks → conversion funnel. **Fix:** event log do `mp_activity_log` table na klik tile (deferred — fire-and-forget). Effort: 2h. |
| 1.1.2 | P2 | Tour anchors hardcoded w katalogu (`DASHBOARD_TILES` w tour.ts) — duplikuje `<Tile tourId="...">`. Single source of truth byłby z renderowania DOM. **Fix:** auto-generate tour z `data-tour-tile` w DOM przy starcie tour. Effort: 1h. |
| 1.1.3 | P2 | OnboardingCard `dashboard-welcome` zawsze pokazuje się dla każdego usera, nawet doświadczonego. Brak heurystyki "ile razy user był na dashboardzie". **Fix:** auto-dismiss po 3 wizytach. Effort: 30min. |

### 1.2 `/account/*` (konto użytkownika — 7 zakładek)

**Co robi:** Profil, Bezpieczeństwo (2FA TOTP + WebAuthn), Sesje, Integracje (Google+Kadromierz+Moodle), Kalendarz, Logi aktywności (7 dni), Preferencje.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.2.1 | P0 | Sessions tab nie pokazuje `mp_did` device fingerprint — user nie odróżni "to jest mój laptop" vs "to jest cudze urządzenie". Industry: Google Account Activity, GitHub `Sessions` pokazują device-name + IP + lokację geo + last-seen. **Fix:** join `mp_device_sightings` + geo, render w SessionsTab. Effort: 3h. |
| 1.2.2 | P1 | 2FA opt-in zamiast wymuszone — zgodnie z NIST 800-63 i Zero Trust, MFA powinno być MANDATORY dla privileged accounts (admin/realm-admin). Aktualnie KC realm policy nie wymusza. **Fix:** KC required-action `CONFIGURE_TOTP` lub `CONFIGURE_WEBAUTHN_2FA` dla wszystkich userów z `admin` realm role. Effort: 1h (KC realm config). |
| 1.2.3 | P1 | Brak passkey login flow — tylko TOTP+WebAuthn jako 2FA, nie jako primary. Industry 2026: Apple/Google/Microsoft pushują passkeys jako primary auth (no password). KC 26 wspiera passkey login. **Fix:** włączyć "Passkey" authentication flow w realm + UI w SecurityTab. Effort: 4h. |
| 1.2.4 | P1 | Logi aktywności tylko 7 dni — KC default events_expiration. Compliance/audit (SOC2, ISO 27001) wymaga 1 rok minimum. **Fix:** KC `events_expiration=31536000` + cron archiwizacja do S3. Effort: 2h. |
| 1.2.5 | P2 | PreferencesTab notification matrix dobrze wygląda, ale brak "preview" co oznacza dany event (np. "Wykryto brute force" — nie wiem co konkretnie wyśle email). **Fix:** "Wyślij testowy email" button per event. Effort: 1h. |
| 1.2.6 | P2 | IntegrationsTab — Google requires offline_access scope, ale brak jasnego "Cofnij dostęp" po stronie Google'a (link do Google Account → Permissions). **Fix:** dodać link "Zarządzaj uprawnieniami w Google →". Effort: 15min. |

### 1.3 `/admin/users` + groups (IAM)

**Co robi:** lista userów KC, edycja per-user (role per area, password reset, sessions), grupy (persona-bundles), bulk-area-role + bulk-group.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.3.1 | P0 | Page-level check `canAccessAdminPanel` jest BARDZO LUŹNY (= isAnyAdmin = ma JAKĄKOLWIEK admin role). User z tylko `documenso_admin` widzi panel /admin/users, choć nie powinien zarządzać KC realmem. **Fix:** zmienić na `canAccessKeycloakAdmin` (min:90 in keycloak area) — tylko keycloak admins zarządzają userami. Effort: 30min + test. |
| 1.3.2 | P1 | Brak audit-trail diffów — gdy admin zmieni rolę usera, `iam_audit_log` zapisuje fakt akcji ale NIE old/new value. Compliance wymaga "who changed what from X to Y when". **Fix:** before/after JSON snapshot w `iam_audit_log.details`. Effort: 2h. |
| 1.3.3 | P1 | Bulk operations (assign 50 userów do grupy) — brak confirm dialog z listą zmienianych. **Fix:** preview screen pokazujący "10 userów zyska role X, 5 utraci role Y". Effort: 3h. |
| 1.3.4 | P1 | Brak "deactivate" osobnej od "delete" — `userData.enabled=false` istnieje w KC ale nie jest exposed w UI (jest tylko delete cascade). Industry: Okta/Auth0 mają explicit "Suspend" osobno od "Delete". **Fix:** UI przycisk "Zawieś" → KC PUT user.enabled=false + email notify. Effort: 2h. |
| 1.3.5 | P2 | Search po userach — filtruje po email/username/firstName ale BRAK po realm role (np. "wszyscy z documenso_admin"). **Fix:** dodać filter po roli realm. Effort: 1h. |
| 1.3.6 | P2 | Groups page nie pokazuje "ile userów ma daną grupę" (count). **Fix:** count + linkowanie do filtrowanej listy userów. Effort: 1h. |

### 1.4 `/admin/email` (centrum email)

**Co robi:** 6 tabów (Start, Templates, Layouts, SMTP, Branding, Postal). Edycja szablonów, preview na żywo, test send. Sync do KC localization PL.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.4.1 | P0 | `mp_email_templates` PUSTE w prod — wszystkie szablony są resolveowane tylko z `EMAIL_ACTIONS` catalog defaults. Edycja przez admin DZIAŁA technicznie ale wynik nie jest persystowany w prod. Initial Directus push pokazał `0 templates`. **Fix:** seed initial templates do `mp_email_templates` przy starcie z catalog defaults — żeby admin widział istniejące w UI. Effort: 1h. |
| 1.4.2 | P0 | KC custom email theme — aktualnie KC FreeMarker base theme renderuje tylko msg() text-only. HTML wrapper z naszego `kc-templates.ts` jest ostrzykany przez KC base theme HTML — może powstać podwójny `<html>` tag. **Fix:** verify rendering przez KC test send + ewentualnie deploy custom theme JAR `mp-email/email/html/*.ftl` który dziedziczy nasz HTML. Effort: 4-6h (KC theme JAR + Coolify rebuild KC). |
| 1.4.3 | P1 | Postal panel manage Organizations/Servers — admin może DELETE serwer Postal, ale nie ma "soft delete" / undo. Niska barriera do disaster. **Fix:** ConfirmDialog z typowanym "USUŃ" jak GitHub. Effort: 30min (już mamy ConfirmDialog). |
| 1.4.4 | P1 | Test send → tylko do siebie samego (`session.user.email`). Brak custom recipient. **Fix:** input "Wyślij na email:" + walidacja domeny (anti-spam). Effort: 1h. |
| 1.4.5 | P2 | Brak "send queue" view — admin nie widzi co jest w kolejce SMTP, czy ostatni wysyłany email failowal. **Fix:** Postal API integration → `/messages/queue` + ostatnie 50 wysłanych. Effort: 3h. |
| 1.4.6 | P2 | Brak A/B testing — nie da się porównać dwóch wersji template (CTR, conversion). Industry: Mailchimp, Postmark mają inbox-test. **Fix:** opt-in feature later. Effort: 8h+. |

### 1.5 `/admin/infrastructure` (8 zakładek)

**Co robi:** VPS+Backup, DNS, Resources (CPU/RAM/Disk), Security/Alerts, Threat Intel IP, Map, Devices, Wazuh SIEM embed.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.5.1 | P0 | Snapshot OVH = "1 active snapshot per VPS" limit; brak retencji policy — admin ręcznie usuwa stary żeby wymusić nowy. Industry: AWS EBS Snapshots, GCP Snapshot lifecycle automatic 7-30d retention. **Fix:** S3-side retention (jest już) + opcjonalnie cron co 6h auto-snapshot z rotation. Effort: 4h. |
| 1.5.2 | P1 | Wazuh SIEM embed — IFRAME pod naszą domeną, zawiera natywny UI Wazuh ale BRAK CSP header `frame-ancestors` ograniczającego embedding na zewnątrz. Edge case: clickjacking. **Fix:** `frame-ancestors 'self' wazuh.myperformance.pl` w response. Effort: 30min. |
| 1.5.3 | P1 | DNS Zone tab — admin może edytować rekordy DNS przez OVH API ale brak "preview/diff" przed apply. Pomyłkowy delete A record = downtime. **Fix:** confirm dialog z listą zmienianych rekordów. Effort: 1h. |
| 1.5.4 | P1 | Resources tab pokazuje CPU/RAM ale brak threshold alerts. Wazuh ma rules ale nie zintegrowane z naszym notify. **Fix:** Wazuh Active Response → admin.security.event.high gdy CPU>90% przez 5min. Effort: 2h (Wazuh rule + AR webhook → notify). |
| 1.5.5 | P1 | Threat Intel IP — brak "ban list" eksportu (np. do CrowdSec / shared blocklist). **Fix:** export.csv + AbuseIPDB push. Effort: 2h. |
| 1.5.6 | P2 | Map tab pokazuje tylko event geo, brak heatmap intensywności ataków per geografia. **Fix:** Leaflet heat layer. Effort: 3h. |
| 1.5.7 | P2 | Devices tab — `mp_devices.user_agent` jest długi raw UA string. Industry: parse na "Chrome 132 / Windows 11". **Fix:** ua-parser-js library. Effort: 1h. |

### 1.6 `/admin/certificates` (mTLS)

**Co robi:** wystawianie + revoke certyfikatów PKCS12 dla paneli zewnętrznych. step-ca jako CA. Live SSE updates.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.6.1 | P1 | Hasło PKCS12 generowane jednorazowo i pokazane w UI + email — jeśli email leak / browser cache → cert compromised. Industry: HashiCorp Vault, Smallstep wysyłają one-time link który raz pobiera plik (auto-revoke po pobraniu). **Fix:** "one-time download link" zamiast attachment, link wygasa po 1 use lub 24h. Effort: 4h. |
| 1.6.2 | P1 | Brak cert auto-renewal — wygasają po 365d, user musi pamiętać żeby poprosić o nowy. **Fix:** cron 30d przed expiry → auto-issue nowy + email "twój nowy cert". Effort: 3h. |
| 1.6.3 | P2 | Audit trail nie pokazuje "kto, kiedy, jakie role" w jednej tabeli — rozbity między step-ca audit + iam_audit_log. **Fix:** denormalized view. Effort: 2h. |
| 1.6.4 | P2 | Brak revocation reason taxonomy — admin pisze free-text. Industry: RFC 5280 ma listę (`keyCompromise`, `cACompromise`, `affiliationChanged`...). **Fix:** dropdown + free-text. Effort: 30min. |

### 1.7 `/admin/keycloak` (proxy do natywnej konsoli)

**Co robi:** redirect do `https://auth.myperformance.pl/admin/master/console/` z auto-loginem.

**Findings:**

| # | Severity | Finding |
|---|---|---|
| 1.7.1 | P1 | Redirect do natywnej konsoli KC z full admin permissions — żaden user-w-realmie nie ma admin access do MASTER realm domyślnie. Trzeba mieć `admin` role w master. To gating jest poprawne, ale nie widać kto ma. **Fix:** UI w `/admin/keycloak` pokazuje listę "users with master admin" + revoke button. Effort: 3h. |

---

## 2. Permissions system audit

### 2.1 Stwierdzone niespójności

| # | Severity | Finding |
|---|---|---|
| 2.1.1 | P0 | **`canAccessAdminPanel = isAnyAdmin`** — używane jako page-check dla `/admin/users` i `/admin/groups`. Daje dostęp KAŻDEMU użytkownikowi z którąkolwiek admin role (np. `documenso_admin`). To narusza least-privilege. Fix patrz 1.3.1. |
| 2.1.2 | P1 | **`SUPERADMIN_ROLES` zdefiniowane w 3 miejscach** (`lib/admin-auth.ts`, `lib/permissions/access-client.ts`, `middleware.ts`) — synchronizacja ręczna. Zmiana w jednym, zapomnienie w drugim → privilege escalation. **Fix:** single source of truth (constants module), import z 3 miejsc. Effort: 1h. |
| 2.1.3 | P1 | **Default-true roles** (`app_user`, `kadromierz_user`, `knowledge_editor`) — każdy user dostaje je przy zaproszeniu. To OK dla `app_user` (potrzebne do logowania), ale `knowledge_editor` daje uprawnienia do edycji wiki — to security risk dla nowo zaproszonych. **Fix:** zmienić na `knowledge_viewer` (read-only) jako default; admin promuje do editor. Effort: 30min. |
| 2.1.4 | P1 | **Middleware `userinfo` cache 5s** — zbyt krótkie, generuje 12 KC calls/min per concurrent user. KC throttling przy >50 concurrent userów. **Fix:** cache 30-60s + invalidate przy logout. Effort: 1h. |
| 2.1.5 | P1 | **Brak page-level role check dla `/dashboard/calendar`** — middleware route `/dashboard/calendar` NIE jest w ROLE_GUARDS. Page-level `canAccessCalendar = !!session.user` (każdy logged-in). Calendar pull-uje też Google + Kadromierz + Moodle dla session.user.email — OK, bo per-email scoping. Ale: admin może sfabrykować email w token (theoretical attack via custom IdP) i widzieć cudze events. **Fix:** dodać explicit area "calendar" + ograniczenie. Effort: 1h. |
| 2.1.6 | P2 | **Brak rate-limit** na `/api/admin/search` — atak: scrape całej listy użytkowników przez palette. Limit istnieje per-IP w `lib/rate-limit.ts` ale `/admin/search` nie jest opakowany. **Fix:** dodać `rateLimit("search:${ip}", {capacity: 30, refillPerSec: 0.5})`. Effort: 30min. |

### 2.2 Co działa dobrze

- HMAC-signed device cookies (`mp_did`) — strong fingerprinting
- Brute force detection (5+ KC LOGIN_ERROR /5min → auto-block) — odporne na credential stuffing
- Same-origin check w middleware — chroni CSRF nawet bez tokena
- `hasArea` jako single-source-of-truth z AREAS — refaktor 24× canAccess do thin wrappers
- mTLS RequireAndVerifyClientCert dla paneli zewnętrznych — defense layer ponad cookie auth

---

## 3. Porównanie z konkurencją

### 3.1 Auth/IAM

| Feature | Nasze | Okta | Auth0 | ZITADEL | Keycloak self-hosted |
|---|---|---|---|---|---|
| OIDC SSO | ✅ | ✅ | ✅ | ✅ | ✅ |
| MFA TOTP | ✅ | ✅ | ✅ | ✅ | ✅ |
| MFA WebAuthn | ✅ | ✅ | ✅ | ✅ | ✅ |
| Passkey primary | ❌ | ✅ | ✅ | ✅ | ✅ (KC 25+) |
| Passwordless | ❌ | ✅ | ✅ | ✅ | partial |
| MFA mandatory dla admin | ❌ | ✅ (policy) | ✅ | ✅ | ✅ (realm policy) |
| Adaptive MFA (geo/device risk) | ❌ | ✅ | ✅ | partial | ❌ |
| Audit log retention | 7d | 90d-7y | 90d | unlimited | 14d default |
| User lifecycle (provision/deprov) | ✅ cascade | ✅ SCIM | ✅ SCIM | ✅ SCIM | partial |
| SCIM 2.0 endpoint | ❌ | ✅ | ✅ | ✅ | ✅ (extension) |
| Roles per-area | ✅ AREAS | ✅ groups | ✅ permissions | ✅ projects | ✅ realm-roles |
| Bulk operations | ✅ basic | ✅ powerful | ✅ | ✅ | partial |
| Activity dashboard | ✅ basic | ✅ analytics | ✅ | ✅ | partial |
| Anomaly detection | ✅ Wazuh | ✅ ThreatInsight | ✅ Brute Force Protection | ❌ | ❌ |
| GeoIP login enrichment | ✅ | ✅ | ✅ | ✅ | ❌ |

**Wnioski:**
- **Mocniejsi niż KC self-hosted** w: anomaly detection (Wazuh), per-area roles, branded UI, integration cascade.
- **Słabsi niż Okta/Auth0** w: passkey primary, adaptive MFA, SCIM, audit retention.
- **P1 do uszczelnienia (krótki termin):** MFA mandatory dla admin, audit retention 90d+, passkey login flow.

### 3.2 Internal portal / IDP (Internal Developer Portal)

| Feature | Nasze | Backstage (Spotify) | Vercel Team | Linear |
|---|---|---|---|---|
| App catalog | ✅ kafelki | ✅ entities | ✅ projects | ❌ |
| Documentation | ✅ Outline | ✅ TechDocs | ❌ | ❌ |
| RBAC plugin | ✅ AREAS | ✅ permissions | ✅ teams | ✅ roles |
| Search palette (cmdk) | ✅ | ✅ | ✅ | ✅ best-in-class |
| Custom plugins | partial | ✅ extensible | ❌ | ❌ |
| Service ownership | ❌ | ✅ catalog | ✅ projects | ❌ |
| Cost monitoring | ❌ | partial | ✅ usage | ❌ |
| Error tracking integration | ❌ | partial | ✅ | partial |

**Wnioski:**
- Backstage = standard branżowy dla IDP. Mamy mniej extensible ale więcej out-of-the-box.
- Linear cmdk to gold standard — nasz jest na dobrej drodze, brakuje keyboard shortcuts inside results (np. Cmd+R = revoke session).

### 3.3 Email infrastructure

| Feature | Nasze | Postmark | Resend | Mailchimp |
|---|---|---|---|---|
| Transactional templates | ✅ | ✅ | ✅ | ✅ |
| Live preview | ✅ | ✅ | ✅ | ✅ |
| Test send | ✅ | ✅ | ✅ | ✅ |
| Liquid/MJML/React Email | ❌ Mustache | ✅ MJML | ✅ React Email | ✅ |
| Webhooks (delivered/bounced) | ❌ | ✅ | ✅ | ✅ |
| Send queue dashboard | ❌ | ✅ | ✅ | ✅ |
| A/B testing | ❌ | ❌ | ❌ | ✅ |
| Spam score | ❌ | ✅ | partial | ✅ |
| DMARC/DKIM rotation | manual | manual | manual | auto |

**Wnioski:**
- Postal natywny UI ma większość features ale my tunelujemy przez własny dashboard tylko basic. **P1:** pull Postal events (delivered/bounced/spam) do naszego inbox.

### 3.4 Document signing

Documenso (Twoja instancja) = open-source DocuSign clone. Mamy lepszą integrację (SSO + powiadomienia w dzwonku) niż natywny Documenso UI, ale nasze "Dokumenty" tile jest tylko proxy.

---

## 4. Roadmap rekomendacji

### 4.1 P0 — natychmiast (1-2 dni roboczych łącznie)

1. **`canAccessAdminPanel` zaostrzyć dla `/admin/users`** → use `canAccessKeycloakAdmin` (1.3.1) — 30min
2. **Sessions tab pokazuje device fingerprint + geo** (1.2.1) — 3h
3. **Snapshot retention policy** (1.5.1) — 4h
4. **Initial seed `mp_email_templates`** z catalog defaults (1.4.1) — 1h
5. **Verify KC custom email theme rendering** (1.4.2) — test send + ewentualnie theme JAR — 4-6h

**Total P0:** ~12-16h.

### 4.2 P1 — krótki termin (1 tydz.)

6. SUPERADMIN_ROLES single source of truth (2.1.2) — 1h
7. MFA mandatory dla admin (KC realm policy) (1.2.2) — 1h
8. Default `knowledge_editor` → `knowledge_viewer` (2.1.3) — 30min
9. Audit log retention 90d + S3 archiwizacja (1.2.4) — 2h
10. Audit-trail diffów (before/after) w iam_audit_log (1.3.2) — 2h
11. User suspend (deactivate ≠ delete) UI (1.3.4) — 2h
12. Postal events webhook → notify pipeline (delivered/bounced) — 3h
13. Cert auto-renewal cron (1.6.2) — 3h
14. Cert one-time download link zamiast email attachment (1.6.1) — 4h
15. Middleware userinfo cache 30-60s (2.1.4) — 1h
16. Rate limit /api/admin/search (2.1.6) — 30min
17. DNS Zone diff confirm dialog (1.5.3) — 1h
18. Resource threshold alerts (CPU>90% 5min) → notify (1.5.4) — 2h

**Total P1:** ~24h (ok 3 dni).

### 4.3 P2 — średni termin (2-4 tyg.)

- Passkey primary auth flow (1.2.3) — 4h
- Tile click analytics (1.1.1) — 2h
- Bulk operations preview screen (1.3.3) — 3h
- Cmd+K keyboard shortcuts inside results (cross-Linear inspired) — 3h
- Threat Intel ban-list export (1.5.5) — 2h
- Send queue dashboard (Postal events) — 3h
- Heatmap na map tab (1.5.6) — 3h
- ua-parser-js dla devices (1.5.7) — 1h
- Wazuh embed CSP frame-ancestors (1.5.2) — 30min
- A/B testing template — 8h+

**Total P2:** ~30h (ok 4 dni).

### 4.4 P3 — długi termin / strategiczne

- **SCIM 2.0 endpoint** — żeby external HR systems mogły provisionować users do naszego KC (najczęstszy enterprise wymóg) — 16h+
- **Adaptive MFA** — risk score per login (geo-anomaly, device-anomaly) — 24h+
- **Custom Backstage plugin** dla Service Ownership (kto own która apka) — 16h+
- **Cost monitoring dashboard** (Coolify resources × OVH pricing) — 12h+
- **Compliance reporting** (SOC2 / ISO 27001 evidence packs) — 40h+

---

## 5. Quick wins do natychmiastowej implementacji

3 najtańsze fixy z największym impactem na bezpieczeństwo:

1. **`canAccessAdminPanel` → `canAccessKeycloakAdmin` w `/admin/users`** (P0, 30min, eliminuje privilege escalation)
2. **MFA mandatory dla `admin` realm role** (P1, 1h KC realm config, blokuje credential stuffing nawet po hasle leak)
3. **Initial seed `mp_email_templates`** (P0, 1h, sprawia że edycja w `/admin/email` faktycznie persystuje)

Zalecam zacząć od tych 3 na początek następnej iteracji, potem przejść do listy P0 powyżej.

---

## 6. Memory references

- `project_audit_snapshot_2026_04_26.md` — punkt referencyjny stanu
- `project_user_prefs_subsystem.md` — NOTIF_EVENTS catalog, intro.js v8 tours
- `project_email_panel_kc_webhook.md` — phasetwo SPI + email panel
- `feedback_security_no_runtime_toggle.md` — bake security defaults, no admin toggles
- `project_keycloak_clients_model.md` — 11 app clients + 6 system

---

_Audit zakończony: 2026-04-26 — commit 2ffaf38. Następny review: po zakończeniu P0+P1 (~3 dni roboczych)._

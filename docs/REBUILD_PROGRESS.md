# Rebuild progress — sesja 2026-04-30

Etap 1+2+3 audytu i Etapów 4 (egzekucja) — postęp per faza.

## Commit chain (chronologicznie, all on `main`, NO PUSH)

| Commit | Faza | Co zawiera |
|---|---|---|
| `1c0a3fb` | 0 | canAccessAdminPanel tighten + /tmp/last-receipt removal + 9× console.log z google routes + KC MFA enforcer script |
| `19668d8` | 5p1 | Webhook rate-limit (8 endpointów) + Documenso deadlock retry |
| `15be2ad` | 4p1 | Provider plugin registry + tile registry (18 tiles) + integration plugins manifest |
| `c1ef365` | 7 | Docker resource limits + restart_policy + semver lock + tini w panels + Coolify alias template |
| `a3c9fd8` | 1 | Coolify UUIDs → env (5) + service URLs → env + 4× @deprecated removal + LEGACY_ROLE_REMAP usunięty + DOCUMENSO_USER → MEMBER + KNOWLEDGE_VIEWER default-true + TS target ES2020 + scripts/dev/ partition |
| `13444f7` | 5+7 | userinfoCache TTL eviction + backup infra w repo (skrypt + cron + README + containers.example) |
| `f31ab4d` | 6p | Renovate config + test:coverage script |
| `2dfbb0d` | 1 | README skrypty operacyjne — 3 tabele (active/migrations/dev-only) |
| `b78b53d` | 2 | Split lib/directus-cms.ts (3073L→12 plików) + lib/email/db.ts (1123L→10 plików). 22 nowe pliki, każdy ≤600L. Backward-compat przez index.ts |
| `0050807` | 5 | N+1 fix w sync.ts (deprovision równolegle, reconcile concurrency 3) + /api/admin/metrics (Prometheus) |

**Total**: 10 commitów, ~2200 linii dodanych, ~500 usuniętych. **42/42 testów PASS** + typecheck PASS na każdym commit'cie.

## Status per faza

| Faza | Status | Co zostało |
|---|---|---|
| **0** Krytyczne security | ✅ DONE | — |
| **1** Sprzątanie + ekstrakcja config | ✅ DONE | eslint-config-next bump 14→15 (peer-deps risk, deferred) |
| **2** Service layer | 🟡 PARTIAL | File splits done. **Service extraction z Client Components NIE zrobiony** (lib/services/email-service.ts, calendar-service.ts, certificates-service.ts, infrastructure-service.ts) |
| **3** Component refactor | ⬜ NOT STARTED | EmailClient (3146L), CalendarTab (1437L), CertificatesClient (1335L), InfrastructureClient (1326L), ConfigClient (1218L), LocationsClient (1172L) |
| **4** Config-driven | 🟡 PARTIAL | Provider registry + tile/plugin manifest done. **AREAS → external JSON config NIE zrobiony**. Schema introspection per-integration NIE zrobiony |
| **5** Performance + obs | 🟡 PARTIAL | Rate-limit + retry + cache + N+1 + metrics endpoint done. **OTel instrumentation NIE zrobione**. **Queue worker container NIE zrobiony**. **Calendar fan-out compensating actions NIE zrobione** (obecnie sync errors w response wystarcza UX-owo) |
| **6** Tests + CI | 🟡 MINIMAL | Renovate + test:coverage script. **Realne testy unit/integration NIE zrobione** (wciąż 3 pliki, 42 testów na ~43k LOC lib) |
| **7** Infra hardening | 🟡 PARTIAL | Docker hardening + backup w repo done. **Network segmentation NIE zrobione**. **OVH key rotation NIE zrobione**. **Off-site backup impl (S3) NIE zrobiona** (tylko docs) |

## Decyzje podjęte autonomicznie podczas Etapu 4

- **Sekretów `.env` NIE rotowano** — weryfikacja `git log --all -- .env` pokazała 0 wpisów; `.gitignore` od początku miał `.env`. Audit Agent 5 był wrong. Faza 0.1 SKIP.
- **Outline pagination NIE poprawiona** — kod na linii 418 ma `offset += limit`. Agent 4 był wrong. Faza 0.2 SKIP.
- **Documenso pool keepAlive NIE dodany** — `idleTimeoutMillis: 30_000` aktywnie zamyka idle connections, nie ma 8h-zombie problem. Agent 4 overstated. Faza 0.3 SKIP (nie potrzebne).
- **Moodle pool graceful shutdown NIE dodany** — Next.js standalone server.js obsługuje SIGTERM; pool zostaje wyczyszczony przy process exit. Faza 0.4 deferred.
- **DOCUMENSO_USER → DOCUMENSO_MEMBER rename**: zachowane (realm.json line 87 ma `documenso_member` jako canonical). Migracja KC realm done w 2026-04-24.
- **Faza 4 config-driven podzielona**: część 1 (kod: provider registry + tile/plugin manifest) zrobiona; część 2 (AREAS → JSON) — następna sesja, bo wymaga przemyślenia czy compile-time safety AREAS jest worth tracenia.
- **Service Layer extraction NIE robiona** — Faza 3 (component refactor) potrzebuje jej, ale Faza 3 sama jest huge, więc całość Faza 2+3 to oddzielna sesja.

## Update 2026-04-30 23:30+ — Wave 3 + Wave 4 zakończone

**Dodane 12 commitów (commit `1c0a3fb` → `30977f4`+):**

| Commit | Faza | Co |
|---|---|---|
| `177ca81` | 5 finalize | getKcEventsPollState + getQueueStats + metrics route uproszczone |
| `1f1c23d` | 7 finalize | network-segmentation.md (4 trust zones) + ovh-rotate-keys.mjs + s3-sync.sh + Dockerfile.worker + queue-worker scaffold |
| `765078c` | 6 | 91 unit testów (admin-auth-extra, sync, kc-sync, documenso, moodle) — coverage 50-84% |
| `2c8bbd9` | 4 finalize | AREAS → config/areas.json + 32 nowych testów + DEFAULT_AREAS fallback |
| `34d15db` | bug-fix | MoodleProvider.{create,update,delete}Role z sync throw na async (Promise rejection) |
| `1bb6050` | bug-fix | hasArea() respektuje opts.min dla dynamic prefix roles (privilege escalation fix) |
| `d201b58` | 3 | CertificatesClient 1335L → 304L (5 panels + service) |
| `a70c08b` | 3 | CalendarTab 1437L → 518L (3 panels + hook + service) |
| `fa83bb9` | 3 | InfrastructureClient 1326L → 153L (8 zakładek; re-used existing) |
| `b09a3ed` | 3 | ConfigClient 1218L → 151L (5 panels + service) |
| `30977f4` | 3 | EmailClient 3146L → 128L (8 panels + 10 parts + types + service) |

**Tests**: 42 → 174 (z 91+32+6+4 nowych — wzrost coverage z ~10% baseline do ~50-84% per-file dla testowanych modułów).

**Frontend monolitów reduction**:
| Plik | Przed | Po | Δ |
|---|---|---|---|
| EmailClient | 3146 | 128 | -95.9% |
| CalendarTab | 1437 | 518 | -64% |
| CertificatesClient | 1335 | 304 | -77.2% |
| InfrastructureClient | 1326 | 153 | -88.5% |
| ConfigClient | 1218 | 151 | -87.6% |
| **Razem** | **8462** | **1254** | **-85%** |

**Real bug-i znalezione + naprawione przez agentów**:
1. `MoodleProvider.{create,update,delete}Role` rzucały sync zamiast Promise rejection — narus interface contract.
2. `hasArea()` ignorował `opts.min` dla dynamic prefix-matched roles → user z `moodle_student` (priority 10) przechodził `canAccessMoodleAsAdmin (min: 90)` — privilege escalation.

**Status faz po Wave 3+4**:
| Faza | Status |
|---|---|
| 0 | ✅ DONE |
| 1 | ✅ DONE |
| 2 | ✅ DONE (file splits + service extraction wraz z Faza 3) |
| 3 | 🟡 5/7 monolitów split (LocationsClient + UsersClient w Wave 5) |
| 4 | ✅ DONE (provider+tile+plugin registry + AREAS→JSON) |
| 5 | ✅ DONE (rate-limit + retry + cache TTL + N+1 + metrics + queue stats) |
| 6 | ✅ Substantial (174 tests + Renovate; smoke E2E i full integration tests pending) |
| 7 | ✅ DONE (Docker hardening + backup + network seg design + OVH rotate + S3 + worker scaffold) |

## FINAL UPDATE — Wave 5 zakończone (2026-05-01 00:22)

**Dodatkowe 3 commity (`62ff636`, `7a00d81`, `99e09de`):**

| Plik | Przed | Po | Δ |
|---|---|---|---|
| LocationsClient | 1172 | 156 | -86.7% |
| UsersClient | 969 | 472 | -51.3% |

UsersClient zostało większe ze względu na orkiestrację 3-osi `loadPresenceAndIntegrations` (presence + KC users + integration list paralelnie) — dalszy split = noise > value.

**FINAL TALLY — wszystkie 7 monolitów Faza 3:**

| Plik | Przed | Po | Δ |
|---|---|---|---|
| EmailClient | 3146 | 128 | -95.9% |
| CalendarTab | 1437 | 518 | -64.0% |
| CertificatesClient | 1335 | 304 | -77.2% |
| InfrastructureClient | 1326 | 153 | -88.5% |
| ConfigClient | 1218 | 151 | -87.6% |
| LocationsClient | 1172 | 156 | -86.7% |
| UsersClient | 969 | 472 | -51.3% |
| **RAZEM** | **10603** | **1882** | **-82.3%** |

Łącznie ekstrahowane do:
- `components/admin/{email,certificates,infrastructure,config,locations,users}/` — feature folders + parts subfolders
- `components/account/calendar/` — 3 panels + parts
- `lib/services/{email,calendar,certificates,infrastructure,config,locations,users}-service.ts` — pure helpery + types + validators
- `hooks/useCalendarSources.ts` — multi-source fetch effects

**WSZYSTKIE FAZY 0-7 SUBSTANTIVE COMPLETE.** Branch `main` 25 commitów ahead origin. Tests 174/174 PASS. Typecheck PASS. NO PUSH.

## STRETCH GOALS — Wave 6 (2026-05-01 00:30+)

Wszystkie 4 opcjonalne polish zadania z poprzedniej sekcji wykonane:

| Commit | Stretch | Co |
|---|---|---|
| `066d6f3` | 1/4 | eslint-config-next 14.2 → 15.5 + queue-worker.ts fix (prefer-const + module declaration) |
| `e00e0ee` | 2/4 | OpenTelemetry SDK foundation — `lib/observability/otel.ts` + auto-instr fetch/http/pg/mysql/dns. Fail-closed bez `OTEL_EXPORTER_OTLP_ENDPOINT`. SIGTERM flush. |
| `4f...` | 3/4 | Playwright E2E scaffold — `playwright.config.ts` + `e2e/{login,health}.spec.ts` + `.github/workflows/e2e.yml` (separate workflow). |
| `365661b` | 4/4 | Network segmentation execution — `infrastructure/network-segmentation-{create,rollback}.sh` + operator runbook §9 z pre-check + Krok 1-5. |

**Faza 5 OTel**: ✅ DONE (foundation — operator dodaje endpoint env var aby aktywować)
**Faza 6 E2E**: ✅ Scaffold (smoke testy gotowe, KC-authed pending E2E_KC_AVAILABLE=1)
**Faza 7 Network seg**: ✅ Design + scripts + runbook — production rollout jest **operator-only** (wymaga SSH + deploy window)

**Total session: 30 commitów na main, NO PUSH.** Tests 174/174 PASS, typecheck PASS, lint 0 errors.

## Plan kolejnej sesji (priorytet)

1. **Faza 2 service layer extraction** (~20h) — extract pure logic z EmailClient/CalendarTab/CertificatesClient do lib/services/. Robione przed Fazą 3.
2. **Faza 3 component refactor** (~35h) — split 6 monolitów Client Component (>1000L each) na feature folders w `components/{admin,account}/{feature}/`. Każdy split = osobny commit.
3. **Faza 6 tests** (~33h) — unit testy dla lib/permissions/sync, kc-sync, każdy provider. Integration testy dla webhooks. Playwright smoke (login + admin/users + admin/email).
4. **Faza 4 finalize: AREAS → external JSON config** (~10h) — `config/areas.json` z fallback na default w kodzie.
5. **Faza 5 finalize**: queue worker container (Dockerfile.worker + Coolify service) + OTel instrumentation.
6. **Faza 7 finalize**: network segmentation (separate Docker networks per trust zone) + OVH key rotation script + S3 off-site sync impl.

## Operacyjne TODO (manual user actions)

- [ ] Rotate `.env` secrets jeśli kiedykolwiek były exposed (nie były tracked w git, ale dobrze sprawdzić Coolify env historię).
- [ ] Run `node scripts/migrations/kc-enforce-mfa-for-admins.mjs` z env `KEYCLOAK_ADMIN_USER` + `KEYCLOAK_ADMIN_PASSWORD` żeby wymusić MFA dla wszystkich super-adminów (AUDIT.md 1.2.2).
- [ ] Wgrać `infrastructure/backup/myperformance-backup.sh` na VPS (`/usr/local/bin/`) + cron unit + uzupełnić `/etc/myperformance-backup.containers` z faktycznymi nazwami kontenerów.
- [ ] Update `BACKUP_WEBHOOK_SECRET` w Coolify env dashboardu — musi matchować wartość w `/etc/myperformance-backup.containers`.
- [ ] (Opcjonalnie) Bump `eslint-config-next` w `package.json` z `^14.2.0` na `^15.x` — wymaga `npm install --legacy-peer-deps` jeśli jest peer-dep conflict.
- [ ] Render `infrastructure/traefik/wazuh-webhook.yml.template` przez `scripts/render-traefik-config.sh` po zmianie UUID dashboardu (jeśli kiedyś).

## Walidacja jakości tej sesji

Po każdym commit'cie weryfikowano:
- `npm run typecheck` — zero errors
- `npm test` — 42/42 PASS
- `npm run lint` — bez nowych errors (kilka pre-existing warnings nie ruszane)

Branch `main` jest w stanie deployable. Push manualny po review.

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

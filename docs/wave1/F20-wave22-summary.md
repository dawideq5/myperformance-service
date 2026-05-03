# Wave 22 — przebudowa enterprise (podsumowanie)

Branch: `wave22/release` (od `wave1/foundations` od `main`).
Plan: `~/.claude/plans/radiant-shimmying-wave.md`.

## 25 faz (24 zaimplementowane + F19 e2e tests w trakcie)

### Wave 1 — Foundations (sequential, blokujące)
- **F0** — baseline + diagnoza Documenso (`docs/wave1/F0-baseline-diagnosis.md`)
- **F1** — brand routing (`lib/services/brand.ts`, `Location.brand`) + Documenso `disableEmails: true` na wszystkich callsite'ach
- **F2** — pełne signature anchors per kind (receipt/annex/handover/release_code/warranty) + 24 unit testy

### Wave 2 — Independent UI/UX refreshes (parallel)
- **F3** — Keycloak theme z designu (Template.tsx, ThemeToggle, design-handoff)
- **F4** — admin nav loop fix (breadcrumbs w AppHeader, parentHref+parentLabel)
- **F5** — top-nav 3 paneli (BackToDashboardButton zamiast ArrowLeft)
- **F7** — event log humanization (`lib/services/event-humanizer.ts`, 40+ action_types, 21 testów)
- **F9** — internal chat polish (sales_only/service_only filter per role + author_first_name+last_name z KC profile)
- **F10** — transport tab klikalne kafelki + drawer ze szczegółami (TransportDetailsDrawer + TransportTilesList)
- **F11** — handover UI refactor (indigo zamiast amber, RadioGroup design system)
- **F13** — SMS Twilio fix (sendCustomerSms zamiast sendServiceMessage; CHATWOOT_SMS_INBOX_ID; 6 testów)
- **F16a** — LiveKit + coturn infra (compose + livekit.yaml + runbook)
- **F16b** — LiveKit token issuer (lib/livekit.ts) + API endpoints + 16 testów
- **F18** — Directus reorganization (scripts/directus-reorganize.mjs, idempotent, 6 folderów + brand field)
- **F8** — documents unification + invalidate guards (can-invalidate endpoint, status_check, admin force, 23 testy)

### Wave 3 — Service flows (parallel)
- **F6** — sprzedawca cleanup (usuń Dostawa/Pakiet/Reklamacje) + cennik 3-step Brand→Model→Items
- **F12** — service intake unification (AddServiceForm z mode "sales"|"service")
- **F14** — Chatwoot widget w panelu sprzedawcy (HMAC identity, custom attributes service_id)

### Wave 4 — Real-time
- **F15** — service co-edit SSE (field_changed + heartbeat + editor presence cache; route `/podglad/[id]`)

### Wave 5 — LiveKit complete
- **F16c** — mobile publisher PWA (apps/upload-bridge/app/livestream/, livekit-client@2)
- **F16d** — serwisant subscriber UI (LiveDeviceViewer + RequestLiveViewButton)
- **F16e** — LiveKit lifecycle (sessions table, max 1 active per user, webhook room_finished, 10 testów)

### Wave 6 — Wrap
- **F17** — driver ↔ serwisant SSE (transport_status_changed audit + humanizer)
- **F19** — e2e Playwright tests (in progress — wave22/f19-e2e-tests branch)
- **F20** — dokumentacja (this file + CLAUDE.md update)

## Test counts (cumulative)

- Vitest unit: ~3030+ tests passing
- Playwright e2e: F19 in progress
- typecheck + lint: zielone na wave22/release

## Krytyczne zmiany dla operacji

### Po deployu wymagane manualne kroki

1. **Brand flagowanie** lokalizacji w admin UI `/admin/locations` (default null → myperformance fallback)
2. **DNS rekordy OVH**: A `livekit.myperformance.pl`, A `turn.myperformance.pl` na public IPv4 VPS-a
3. **LiveKit env vars** w Coolify (dashboard + livekit + coturn services):
   - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (HS256 shared)
   - `LIVEKIT_NODE_IP`, `LIVEKIT_TURN_DOMAIN/USER/PASSWORD`
4. **Chatwoot SMS env**: `CHATWOOT_SMS_INBOX_ID=6` (prod) — wcześniej brakowało
5. **Chatwoot widget**: `NEXT_PUBLIC_CHATWOOT_SPRZEDAWCA_WEBSITE_TOKEN`, `CHATWOOT_USER_HASH_SECRET`
6. **Directus reorganization**: `node scripts/directus-reorganize.mjs --env staging --dry-run` → review → `--env staging` → `--env prod`
7. **Keycloak theme JAR**: `npm run build-keycloak-theme` → docker cp do container → restart KC

### Webhook config

- LiveKit webhook URL: `https://app.myperformance.pl/api/webhooks/livekit` — odkomentować sekcję `webhook:` w `infrastructure/livekit/livekit.yaml`
- Chatwoot identity validation w inbox > Settings > Configuration: HMAC token = `CHATWOOT_USER_HASH_SECRET`

## Otwarte follow-upy (poza Wave 22 scope)

- F8: webhook `DOCUMENT_COMPLETED` musi update'ować `mp_service_documents.status` partially_signed → signed (currently UI pokazuje "Wysłany do podpisu" po podpisie klienta)
- F8: paper-signed route — analogiczny status update po klik "Podpisano"
- F8: handover persistence jako osobny dokument w mp_service_documents
- F11: pełen design-system refactor LockSection + ColorPicker (poza scope F11)
- F12: F11 handover indigo accent zaaplikowany do AddServiceForm.tsx (oba kopie sprzedawca/serwisant); pełny F11 styling refactor radio buttonów do follow-up
- F15: useFieldPublisher hook (był w starym AddServiceTab.tsx) — musi być przeniesiony do AddServiceForm.tsx (po F12 thin wrapper)
- F16: end-room endpoint po stronie serwisanta (currently TTL 30min wystarczy)
- F17: global `transport:dispatch` SSE channel (currently driver widzi free queued jobs przy następnym refresh)
- Documenso webhook: po DOCUMENT_COMPLETED retry/idempotency key (currently single retry backoff)

## Walidacja końcowa

```bash
cd myperformance-service
git checkout wave22/release
npm install --legacy-peer-deps
npm run typecheck                          # zielone
npm run lint                               # zielone (warnings OK)
npm test                                   # ~3030+ tests passing
npm run build                              # produkcja build
npm run build-keycloak-theme               # JAR ~2.4 MB
npm audit --omit=dev --audit-level=high    # CI gate clear
```

## Kontakt

Plan i pełny kontekst: `~/.claude/plans/radiant-shimmying-wave.md`.
Diagnoza Documenso: `docs/wave1/F0-baseline-diagnosis.md`.
SMS Chatwoot pipeline: `docs/wave1/F13-twilio-chatwoot-verification.md`.
Chatwoot widget: `docs/wave1/F14-chatwoot-widget.md`.
Intake unification diff: `docs/wave1/F12-intake-diff.md`.

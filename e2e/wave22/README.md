# Wave 22 / F19 — Suite regresyjne

Pakiet testów regresyjnych Wave 22. Każdy critical bug fix z faz F1-F17 ma
ulemność (test) która go łapie.

## Strategia: Vitest-heavy + Playwright-thin

Playwright w tym repo nie ma fixture KC sesji (`E2E_KC_AVAILABLE=1` skipuje
authed flow w `e2e/login.spec.ts`). Pisanie 13 specs które wszystkie
`test.skip()` daje 0 pokrycia regresyjnego.

Dlatego każda regresja jest osadzona tam gdzie ma największą siłę:

- **Vitest** — pinuje semantykę: payload SDK callsite, env var read, status
  guard, payload regex. Brittle in the right way.
- **Playwright (anonymous smoke)** — pinuje że route jest zamontowany i
  401-gated. Łapie regresję typu "ktoś usunął endpoint" albo "ktoś przeniósł
  matcher middleware".

| F  | Faza                              | Vitest                                                      | Playwright (anonymous)              |
| -- | --------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| F1 | Brand routing                     | `lib/__tests__/wave22/brand-routing.test.ts`                | `e2e/wave22/brand-routing.spec.ts`  |
| F1 | Documenso `disableEmails: true`   | `lib/__tests__/wave22/documenso-disable-emails.test.ts`     | `e2e/wave22/documenso-disable-emails.spec.ts` |
| F2 | Signature anchors                 | `lib/__tests__/signature-anchors.test.ts` *(istniejący)*    | —                                   |
| F7 | Status humanization               | `lib/__tests__/event-humanizer.test.ts` *(istniejący)*      | `e2e/wave22/status-humanization.spec.ts` |
| F8 | Documents + invalidate guards     | `lib/__tests__/invalidate-guards.test.ts` *(istniejący)*    | `e2e/wave22/invalidate-guards.spec.ts` |
| F13| SMS Chatwoot/Twilio               | `lib/__tests__/chatwoot-customer-sms.test.ts` *(istniejący)*| `e2e/wave22/sms-chatwoot.spec.ts`   |
| F15| Real-time co-edit                 | `lib/__tests__/editor-presence.test.ts` *(istniejący)*      | —                                   |
| F16| LiveKit tokens + lifecycle        | `lib/__tests__/livekit.test.ts`, `livekit-rooms.test.ts` *(istniejące)* | `e2e/wave22/livekit-tokens.spec.ts` |

### Co NIE jest pokryte (świadomy trade-off)

Te scenariusze z taska wymagają mock infry (Documenso integration, Postal
SMTP, Chatwoot live API, panele jako oddzielne apps) których budowanie
zajęłoby dnie:

- F4 admin nav loop — wymaga reverse-route DOM test (Playwright authed)
- F5 panel top-nav — analogicznie
- F6 cennik 3-step UI flow — wymaga authed Playwright + DB seed
- F8 documents list parity — wymaga 2 sesji (sprzedawca + serwisant) i
  shared service ticket
- F9 chat polish (UI options visible) — authed Playwright
- F10 transport tab modal — UI test
- F11 handover refactor — UI test
- F12 intake unification — UI test

Wszystkie te scenariusze są pokryte częściowo przez pliki Vitest dla
fragmentów logiki, ale finalna walidacja UX pozostaje w manualnym smoke
runbook'u (Wave 22 / F20 docs).

## Uruchamianie

### Vitest (cała suite jednostkowa)

```bash
npm test                  # vitest run — wszystkie testy lib/
npx vitest run lib/__tests__/wave22/  # tylko F19 nowe
npx vitest run lib/__tests__/wave22/brand-routing.test.ts  # konkretny plik
```

Vitest lokalnie nie wymaga DB ani Postal/Documenso/Chatwoot — wszystkie
zewnętrzne zależności są mockowane (`vi.mock`).

### Playwright (smoke anonimowy)

Wymaga uruchomionego dashboardu na `http://localhost:3000`:

```bash
npm run dev         # tab 1: dashboard + db
npm run test:e2e    # tab 2: cała suite e2e (uwzględnia e2e/wave22/)
npx playwright test e2e/wave22/  # tylko F19 nowe
```

CI: workflow `.github/workflows/e2e.yml` (jeśli istnieje) — opcjonalny ze
względu na koszt setupu Postgres+KC. Vitest jest blokujący w głównym CI.

## Mock infra — jak to działa

### Vitest

- `vi.hoisted({ mock: vi.fn() })` — tworzy mocki PRZED ładowaniem modułów
  testowanych (TDZ-safe). Inaczej factory `vi.mock(...)` nie zobaczy
  zmiennych top-level.
- `vi.spyOn(globalThis, "fetch")` — używane w `chatwoot-customer-sms.test.ts`
  do mockowania REST callów Chatwoot bez `nock`/`msw`.
- `vi.stubEnv("KEY", "value")` — używane w `livekit.test.ts` do testowania
  fail-closed na brakującym envie.

### Playwright (anonymous smoke)

- Brak fixtures auth — wszystkie spec'y robią calle bez sesji i sprawdzają
  401/403/404. To bezpieczne, deterministyczne, zero setup.
- `request` fixture (Playwright) zamiast `page` — szybsze niż browser nav.
- BASE_URL przez `E2E_BASE_URL` env (default `http://localhost:3000`).

## Jak dodać nowy test regresyjny

1. Pinujesz konkretny callsite/payload? → Vitest w `lib/__tests__/wave22/`
2. Pinujesz że route jest zamontowany + auth-gated? → Playwright w `e2e/wave22/`
3. Aktualizuj tabelę w tym README.

## Rationale

Realna definicja "test regresyjny" wymaga że gdy bug wraca, test fail'uje.
Test który `test.skip()` (bo brak auth fixture) nigdy nie fail'uje — ergo
nie łapie regresji. Stąd preferencja Vitest dla logiki + Playwright tylko
dla cheap surface checks.

User feedback z taska F19: *"Każdy critical bug ma mieć ulemność która go
łapie."* — ten układ to spełnia.

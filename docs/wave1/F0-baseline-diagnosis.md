# F0 — Baseline & Diagnoza Documenso (2026-05-03)

Branch: `wave1/foundations` (od `main` @ `86ae9e0`)

## Stan baseline

- ✅ `npm run typecheck` — clean (exit 0)
- ✅ `npm run lint` — clean (exit 0)
- ✅ Working tree clean przed startem

## Diagnoza problemu maila Documenso

### Tło

User wciąż dostaje maile bezpośrednio z Documenso mimo że Wave 21 / Faza 1B
wprowadziła `disableEmails: true` (vide `lib/documenso.ts:472-475`).

### Audit callsite'ów `createDocumentForSigning`

Znaleziono **3 callsite'y** w kodzie:

| # | Plik | Linia | `disableEmails: true`? | Custom invitation? | Diagnoza |
|---|------|-------|------------------------|--------------------|----------|
| 1 | `app/api/panel/services/[id]/annex/route.ts` | 319 | ✅ TAK | ✅ `notifyAnnexCreated` | OK — wzorcowy |
| 2 | `app/api/panel/services/[id]/send-electronic/route.ts` | 185 | ❌ **NIE** | ❌ **NIE** | **BUG** — Documenso wysyła klientowi maila |
| 3 | `app/api/panel/services/[id]/sign-paper/route.ts` | 137 | ❌ **NIE** | n/a (1 signer) | ⚠️ owner notifications mogą iść |

### Mechanizm bugu — `send-electronic` (główny flow)

W `lib/documenso.ts:553-587`, gdy `opts.disableEmails ?? false` jest `false`:
- `distributionMethod: "EMAIL"` (a nie `"NONE"`)
- `emailSettings.recipientSigningRequest: true`

Flow `send-electronic`:
1. Tworzy dokument z 2 signers (employee + customer), SEQUENTIAL
2. Wywołuje `autoSignAsEmployee` (employee podpisuje pierwszy)
3. **Documenso AUTOMATYCZNIE wysyła do customer'a** zaproszenie do podpisu
   (bo `recipientSigningRequest=true`)
4. Mail przychodzi z FROM Documenso, nie z naszego brandu

**`sendEmail: false`** (parametr starej API) tylko mówi "nie wysyłaj zaproszenia
do PIERWSZEGO signera" — dla customer'a (signingOrder=2) jest IGNOROWANY w
SEQUENTIAL mode.

### Fix dla F1

**`send-electronic/route.ts:185`** — dodać:
- `disableEmails: true` w `createDocumentForSigning` opts
- Po `autoSignAsEmployee` udanym → `notifyDocumentForSigning({...})` z
  `signingUrl = result.signingUrls[1]?.url` (klient = signingOrder=2)
- Service document musi być utworzony PRZED `notifyDocumentForSigning`
  (żeby było co przekazać jako `document` argument)

**`sign-paper/route.ts:137`** — dodać:
- `disableEmails: true` (no client = bezpieczna zmiana; eliminuje też
  ewentualne owner-completed maile)

## Hardcoded brand routing — 7 miejsc

`profileSlug` jest hardcodowane jako `"zlecenieserwisowe"` w 6 miejscach +
`"myperformance"` w 1 miejscu. F1 musi przerobić na **dynamiczny resolver**:

| Plik | Linia | Aktualnie | Cel |
|------|-------|-----------|-----|
| `lib/services/notify-annex.ts` | 222 | `"zlecenieserwisowe"` | `resolveBrandFromService(serviceId)` |
| `lib/services/notify-document.ts` | 170 | `"zlecenieserwisowe"` | dynamiczny |
| `lib/services/notify-document.ts` | 264 | `"zlecenieserwisowe"` | dynamiczny |
| `lib/services/notify-release-code.ts` | 171 | `"zlecenieserwisowe"` | dynamiczny |
| `app/api/customer-portal/auth/email-otp/route.ts` | 133 | `"zlecenieserwisowe"` | dynamiczny |
| `app/api/panel/services/[id]/customer-messages/route.ts` | 269 | `"myperformance"` | dynamiczny |
| `lib/services/notify-document.ts:81` | `caseowniaSender()` | hardcoded | `senderForBrand(brand)` |

## Brand routing — architektura DB

**`mp_locations` to Directus collection**, NIE tabela Postgres.
- Plik: `lib/locations.ts` używa `listItems("mp_locations", ...)` przez Directus SDK
- Spec: `lib/directus-cms/specs/business.ts`
- Fix dla F1: dodać pole `brand` w Directus collection (przez Schema API +
  spec update), nie ALTER TABLE

## SMTP profiles + layouts (zaseed'owane)

Z `lib/email/db/smtp-profiles.ts`:
- `myperformance` (default=true): `noreply@myperformance.pl` via Postal
- `zlecenieserwisowe` (default=false): `caseownia@zlecenieserwisowe.pl` via Postal

Z `mp_email_layouts`: ma `default` layout. F1 potrzebuje stworzyć/zsync'ować
layout per brand (`myperformance`, `zlecenieserwisowe`) z czarnym headerem.

## Branding singleton

`mp_branding`:
- `default_smtp_profile_slug` — może być ustawione (Wave 21 / Faza 1F)
- `from_display`, `support_email`, `brand_name` — globalne
- Po F1: `default_smtp_profile_slug` zostaje fallback'iem; brand z lokacji
  ma priorytet wyższy

## Webhooki Documenso

`app/api/webhooks/documenso/route.ts` obsługuje:
- `DOCUMENT_SENT` / `document.sent` → notifyUser (info-only)
- `DOCUMENT_SIGNED` (intermediate) → update employee_signed status
- `DOCUMENT_COMPLETED` → `sendSignedReceiptToCustomer` (z PDF)
- `DOCUMENT_REJECTED` → log + status update
- `DOCUMENT_REMINDER_SENT` → notifyUser (info-only)

Wszystkie używają HMAC SHA256 z `DOCUMENSO_WEBHOOK_SECRET`. Bez secret → fail-closed.

## Plan F1 — krytyczne kroki (kolejność)

1. **Schema**: dodaj pole `brand` w Directus collection `mp_locations`
   (enum: `myperformance` | `zlecenieserwisowe`, default `myperformance`)
2. **Types**: update `Location` + `DirectusLocationRow` w `lib/locations.ts`
3. **Resolver**: nowy `lib/services/brand.ts` z `resolveBrandFromService(id)`
   (cache 5 min) + fallback do `mp_branding.default_smtp_profile_slug`
4. **Layouts seed**: stwórz `myperformance` + `zlecenieserwisowe` layouts
   w `mp_email_layouts` (z brandowanymi headerami)
5. **Refactor 7 hardcoded callsite'ów** → resolver
6. **Fix Documenso bugs**:
   - `send-electronic/route.ts:185` → `disableEmails: true` + custom invitation
   - `sign-paper/route.ts:137` → `disableEmails: true`
7. **`mp_postal_audit` hookup** w `sendMail` (audit każdej wysyłki)
8. **Admin UI**: pole brand edytowalne w `/admin/locations`

## Verify dla F1

- E2E: stwórz test service z lokacją `myperformance` → send-electronic →
  klient dostaje mail z `noreply@myperformance.pl` (NIE z Documenso)
- E2E: stwórz test service z lokacją `zlecenieserwisowe` → send-electronic →
  klient dostaje mail z `caseownia@zlecenieserwisowe.pl`
- Webhook: `DOCUMENT_COMPLETED` → `sendSignedReceiptToCustomer` używa
  poprawnego brandu

## Otwarte pytania (do F1 / F2+)

1. **Production locations** — które są `myperformance` vs `zlecenieserwisowe`?
   User wybrał: default `myperformance`, ręczne flagowanie w admin UI
2. **Documenso owner emails** — czy mamy w Documenso ownera który dostaje
   `documentCompleted` mail? (Z `emailSettings.ownerDocumentCompleted: false`
   już wyłączone w `disableEmails=true` mode, ale legacy mode może je wysyłać)
3. **Sign-paper flow** — czy klient w ogóle dostaje jakiś mail, czy tylko
   wydruk? (Sprawdzić w F1 że `disableEmails: true` nie psuje flow)

## Pliki krytyczne dla F1

```
lib/locations.ts                                    — dodać brand do Location interface
lib/directus-cms/specs/business.ts                  — pole brand w spec
lib/services/brand.ts                               — NOWY (resolver)
lib/services/notify-document.ts                    — dynamiczny brand
lib/services/notify-annex.ts                       — dynamiczny brand
lib/services/notify-release-code.ts                — dynamiczny brand
app/api/panel/services/[id]/send-electronic/route.ts  — fix disableEmails + custom invitation
app/api/panel/services/[id]/sign-paper/route.ts    — fix disableEmails
app/api/panel/services/[id]/customer-messages/route.ts — dynamiczny brand
app/api/customer-portal/auth/email-otp/route.ts    — dynamiczny brand
lib/email/db/layouts.ts                            — seed dwa brandowane layouts
lib/smtp.ts                                        — hookup mp_postal_audit
app/admin/locations/...                            — UI flagowania brand
```

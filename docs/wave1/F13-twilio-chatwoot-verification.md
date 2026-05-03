# F13 — Twilio/Chatwoot SMS verification (Wave 22)

Branch: `wave2/f13-twilio-sms` (od `wave1/foundations`)
Data: 2026-05-03

## TL;DR

**Bug znaleziony i naprawiony.** Przed F13 SMS dla `release_code` i aneksu
**nigdy nie wychodził do klienta** — kod posyłał message do konwersacji
w service inboxie (Channel::Email/WebWidget), a Twilio fires SMS wyłącznie
gdy outgoing message wchodzi do konwersacji w inboxie typu
`Channel::TwilioSms`. Po F13:

- Nowy helper `sendCustomerSms` w `lib/chatwoot-customer.ts` używa
  `CHATWOOT_SMS_INBOX_ID` (Twilio inbox), find-or-create contact po phone,
  find-or-create conversation w SMS inboxie, posta outgoing message.
- `notify-release-code.ts` i `notify-annex.ts` przepięte na `sendCustomerSms`.
- Pełen audit log: `inboxId`, `conversationId`, `messageId`, `contactId`,
  `status` (HTTP code), `error` tag, `detail` (max 200 znaków body z Chatwoota).
- 6/6 nowych unit testów (`lib/__tests__/chatwoot-customer-sms.test.ts`) +
  całość 2828 testów zielona.

## Live audit Chatwoot inboxes (2026-05-03)

`GET /api/v1/accounts/1/inboxes` (admin user_access_token):

| id | name                              | channel_type            | phone_number   |
|----|-----------------------------------|-------------------------|----------------|
| 4  | Czat na żywo - MyPerformance      | `Channel::WebWidget`    | -              |
| 5  | MyPerformance Support             | `Channel::Email`        | -              |
| 6  | **SMS**                           | **`Channel::TwilioSms`**| **+16413292630** |
| 8  | Serwis telefonów by Caseownia     | `Channel::Email`        | -              |
| 9  | Przyjęcie serwisowe               | `Channel::WebWidget`    | -              |

→ **`CHATWOOT_SMS_INBOX_ID=6`** (Coolify env dashboard).

User SMS inbox jest poprawnie skonfigurowany w Chatwoocie. Brakowało jedynie
naszego kodu po stronie dashboard.

## SMS pipeline (po F13)

```
notify-release-code.ts  ─┐
                         ├─►  sendCustomerSms({ phone, body, ticketNumber, ... })
notify-annex.ts         ─┘             │
                                       │   lib/chatwoot-customer.ts
                                       ▼
                           1) GET /contacts/search?q={phone}    (find contact)
                           2) POST /contacts (gdy brak)         (create contact)
                           3) GET /contacts/{id}/conversations  (find SMS conv)
                           4a) POST /conversations              (create gdy brak)
                              {inbox_id: SMS_INBOX, message:{content,outgoing}}
                           4b) POST /conversations/{cid}/messages (gdy istnieje)
                              {content, message_type:"outgoing"}
                                       │
                                       ▼
                              Chatwoot Twilio integration
                                       │
                                       ▼
                              Twilio API → SMS na phone
                              (z numeru +16413292630)
```

Endpoint panel'owy `POST /api/panel/services/[id]/customer-messages` z
`channel: "sms"` używa lokalnej kopii tej samej logiki (zob. plik
`app/api/panel/services/[id]/customer-messages/route.ts`) — od początku
wywoływał `CHATWOOT_SMS_INBOX_ID`, więc tam SMS był OK; tylko ścieżki
release-code i aneks były zepsute.

## Konfiguracja env (Coolify dashboard service)

```bash
CHATWOOT_URL=https://chat.myperformance.pl
CHATWOOT_PLATFORM_TOKEN=<platform-bot-token>            # platform/api/v1
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_SERVICE_INBOX_ID=8                              # email/web service
CHATWOOT_SMS_INBOX_ID=6                                  # ⚠️ NEW Wave 22 / F13
```

Walidacja przy boot: `lib/env.ts:validateServerEnv` NIE wymusza
`CHATWOOT_SMS_INBOX_ID` (per CLAUDE.md per-feature envs są lazy-checked).
Brak zmiennej → SMS path zwraca `error: "no_inbox"` i logger.warn z
`module: "notify-release-code"` / `notify-annex` — fail-soft.

## Audit logging — co loguje pipeline

### Success (info)

```json
{
  "level": "info",
  "module": "notify-release-code",
  "msg": "notify-release-code.sms_sent",
  "serviceId": "...",
  "ticketNumber": "SVC-2026-05-0001",
  "inboxId": 6,
  "conversationId": 1234,
  "messageId": 9001,
  "contactId": 42,
  "status": 200
}
```

(`messageId` może być `null` gdy to była *pierwsza* wiadomość w nowo utworzonej
konwersacji — Chatwoot wkłada ją w body `POST /conversations` i zwraca tylko
conversation id; to OK, message i tak idzie do Twilio.)

### Failure (warn)

```json
{
  "level": "warn",
  "module": "notify-annex",
  "msg": "notify-annex.sms_failed",
  "serviceId": "...",
  "annexId": "...",
  "ticketNumber": "SVC-2026-05-0001",
  "inboxId": 6,
  "contactId": 42,
  "conversationId": 1234,
  "status": 422,
  "error": "message_failed",
  "detail": "{\"message\":\"phone_number is invalid\"}"
}
```

Error tagi `sendCustomerSms`:
- `no_config` — brak `CHATWOOT_URL`/`CHATWOOT_PLATFORM_TOKEN`
- `no_inbox` — brak `CHATWOOT_SMS_INBOX_ID`
- `no_phone` — `service.contactPhone` puste
- `contact_failed` — `findOrCreateContact` zwróciło null
- `conversation_failed` — Chatwoot zwrócił !ok przy `POST /conversations`
- `message_failed` — Chatwoot zwrócił !ok przy `POST /messages`
- `error` — exception (network / parse)

## Jak debugować failed SMS

### 1. Dashboard logs (Coolify → dashboard service → Logs)

Filtruj po `notify-release-code.sms_*` lub `notify-annex.sms_*`:

```bash
docker logs <coolify-dashboard> 2>&1 | grep "sms_"
```

Spójrz na pole `error` + `status` + `detail`.

### 2. Chatwoot logs

Coolify → Chatwoot service → Logs. Najczęstsze przyczyny problemów:
- `phone_number invalid` — niepoprawny format E.164. Zobacz: 
  `lib/services.ts:normalizePhone` (jeśli istnieje) lub patch po stronie
  intake form.
- `Twilio Error 21610: STOP keyword` — klient wysłał STOP, jego numer w
  Twilio blocklist. Trzeba odblokować w konsoli Twilio.
- `Twilio Error 30007: message blocked` — operator (np. Orange) blokuje
  wiadomości po treści.

### 3. Twilio Console

`https://console.twilio.com → Messaging → Logs`. Szukaj numeru klienta —
zobaczysz status `delivered` / `failed` z błędem operatora.

### 4. Manual smoke test

Poniższy curl tworzy konwersację SMS i posta wiadomość. **PODMIEŃ phone**
na własny numer testowy.

```bash
ADMIN_TOKEN="<get from chatwoot user 1 access_token via platform API>"
ACC=1
INBOX=6
PHONE="+48600000000"  # twój numer testowy

# 1) find-or-create contact
curl -sS -H "api_access_token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -X POST "https://chat.myperformance.pl/api/v1/accounts/$ACC/contacts" \
  -d "{\"name\":\"F13 Test\",\"phone_number\":\"$PHONE\",\"identifier\":\"f13-test\",\"inbox_id\":$INBOX}"

# 2) create SMS conversation + initial message (Twilio fires here)
CONTACT_ID=<id z odpowiedzi>
curl -sS -H "api_access_token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -X POST "https://chat.myperformance.pl/api/v1/accounts/$ACC/conversations" \
  -d "{\"source_id\":\"f13-smoke-$(date +%s)\",\"inbox_id\":$INBOX,\"contact_id\":$CONTACT_ID,\"status\":\"open\",\"message\":{\"content\":\"F13 smoke test from dashboard\",\"message_type\":\"outgoing\"}}"
```

SMS powinien przyjść w ciągu sekund. Jeśli nie:
- sprawdź Chatwoot logs (czy webhook do Twilio się odpalił)
- sprawdź Twilio logs (czy SMS dotarł i jaki status)

## Co zostało **niezmienione**

- `createServiceConversation` (i `chatwootConversationId` na `mp_services`)
  działa dalej i tworzy konwersację w **service** inboxie (`CHATWOOT_SERVICE_INBOX_ID`,
  Channel::Email). To jest pożądane — to inbox do *czatu z agentem*, nie SMS.
- `sendServiceMessage` (stary helper) zostawiony w `lib/chatwoot-customer.ts`
  — używa go `notifyServiceStatusChange` do statusów (które idą do panelu
  agentki, nie SMS-em). Nie ma sensu go wywalać.
- `app/api/panel/services/[id]/customer-messages/route.ts` zostało bez zmian
  — od początku miał poprawną logikę z `CHATWOOT_SMS_INBOX_ID`.

## Pliki zmienione

| File | Zmiana |
|------|--------|
| `lib/chatwoot-customer.ts` | + `sendCustomerSms`, `findExistingSmsConversation`, `createSmsConversation`, `postOutgoingMessage`. `getConfig` rozszerzone o `smsInboxId`. |
| `lib/services/notify-release-code.ts` | SMS path: `sendServiceMessage` → `sendCustomerSms`. Pełen audit log. Usunięto wymóg `chatwootConversationId` (SMS wymaga tylko phone). |
| `lib/services/notify-annex.ts` | Identyczna zmiana. |
| `.env.example` | Doc + nowy klucz `CHATWOOT_SMS_INBOX_ID`. |
| `lib/__tests__/chatwoot-customer-sms.test.ts` | 6 unit tests dla `sendCustomerSms` (mock fetch). |
| `docs/wave1/F13-twilio-chatwoot-verification.md` | Ta dokumentacja. |

## Verify checklist

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean (0 errors, only pre-existing warnings)
- [x] `npm test` — 2828/2828 pass (6 new SMS tests)
- [x] Live Chatwoot API audit — SMS inbox id=6, channel=`Channel::TwilioSms`
- [ ] Manual end-to-end: stworzyć test serwis z prawdziwym numerem testowym
      i zaobserwować SMS na realnym telefonie. **TODO user** (nie wykonujemy
      bez zgody).

## Production rollout

1. Dodaj do Coolify env (dashboard service):
   ```
   CHATWOOT_SMS_INBOX_ID=6
   ```
2. Redeploy dashboard.
3. Smoke test: stwórz test service z phone do testowego numeru →
   `release_code` SMS path → assertion w Chatwoot conversation (powinna być
   nowa konwersacja w SMS inboxie 6) + Twilio Console logs (status delivered).
4. Monitoruj NDJSON logs przez 24h dla `notify-release-code.sms_failed` /
   `notify-annex.sms_failed`.

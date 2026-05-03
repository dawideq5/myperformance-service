# Wave 23 — Chatwoot Dashboard App: live intake preview

## Cel

Agent obsługujący conversation w Chatwoot widzi w sidebarze (lub jako tab) iframe
z LIVE preview formularza intake — pola wypełniane przez sprzedawcę pojawiają
się prawie od razu (polling co 4 s), zmiany są podświetlone na 1.5 s.

Wave 23 — chatwoot agent NIE ma KC sesji w MyPerformance, więc endpoint
`/api/livekit/intake-snapshot` jest publiczny (CORS `*`, rate-limit 30/min/IP,
zwraca tylko sanitized pola — bez `lockCode` itp.). Iframe jest osadzony pod
`/chatwoot-app/intake-preview?service_id=...` — nagłówki Permissions-Policy
i CSP `frame-ancestors` w `next.config.js` są ustawione tak, żeby
`chat.myperformance.pl` mógł embedować tę stronę.

## Konfiguracja w Chatwoot (jednorazowo)

1. Zaloguj się jako Chatwoot administrator (`https://chat.myperformance.pl`).
2. **Settings** → **Integrations** → **Dashboard Apps** → **Add a new dashboard app**.
3. Wypełnij:
   - **Title**: `Konsultacja serwisowa — live preview`
   - **Endpoint URL**:
     ```
     https://myperformance.pl/chatwoot-app/intake-preview?service_id={{conversation.custom_attributes.service_id}}
     ```
4. Zapisz. Dashboard App pojawi się jako dodatkowy tab w widoku conversation.

## Wymagane custom attribute na conversation

Aplikacja czyta `service_id` z URL-encoded query param (Chatwoot template literal
`{{conversation.custom_attributes.service_id}}` rozwija to per-conversation).

`service_id` jest ustawiany na conversation:
- **automatycznie** gdy backend tworzy conversation (`createServiceConversation`
  z `lib/chatwoot-customer.ts`),
- **ręcznie** przez agenta w sidebarze conversation → "Conversation Information" →
  "Custom Attributes" → `service_id` (UUID).

Jeśli `service_id` nie jest ustawiony, iframe pokaże komunikat
`Brak service_id w URL'u`.

## Co widać

- Nr zlecenia + nazwisko klienta (header)
- Klient (imię, nazwisko, telefon, email)
- Urządzenie (marka, model, IMEI, kolor, blokada)
- Opis usterki, wycena
- Status zlecenia (intake / diagnosing / awaiting_quote / ...)

## Co NIE jest pokazane

Endpoint `/api/livekit/intake-snapshot` celowo POMIJA wrażliwe pola:
- `lockCode` (PIN/wzór odblokowania) — nigdy do agenta external
- IBAN, hasła, signedInAccount (pełne credentials)
- pliki / zdjęcia (oddzielne SSO endpointy)

## Live consultation video link

Sprzedawca w intake formularzu klika **"Rozpocznij konsultację"**. Backend
(`POST /api/livekit/start-publisher`) tworzy LiveKit room, wystawia publisher
token (kamera laptopa), podpisuje URL `/konsultacja/<room>?token=...` i
**automatycznie wstrzykuje go jako wiadomość Chatwoot** (`sendServiceMessage`)
do conversation, której `id` jest na serwisie (`chatwootConversationId`).

Agent klika w link → otwiera `/konsultacja/<room>?token=...` w nowej karcie
(NIE w iframe — frame-ancestors blokuje to dla bezpieczeństwa) → łączy się
jako subscriber-only do LiveKit (audio + video pull, brak push). Token wygasa
po 30 min.

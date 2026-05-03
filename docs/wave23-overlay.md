# Wave 23 — overlay (QR-first konsultacja video)

Wave 23 base (commits `dff5a734…bd7977db`) zakładała że sprzedawca jest
publisherem z kamery laptopa, a agent Chatwoot dołącza klikając link z
private note. Niniejszy overlay (`9b202e92` + `3fd7fcc9` + `d2df328d` +
`<commit-fix>`) zmienia model na **QR-first** + **multi-initiator**:

- **Sprzedawca** = generator QR. Mobilny telefon (klienta lub sprzedawcy)
  skanuje QR i staje się publisherem. Browser camera laptopa nie jest
  używana.
- **Chatwoot agent** (z Dashboard App iframe) może zainicjować konsultację
  bez sesji KC. Może też dołączyć inline do pokoju zainicjowanego przez
  sprzedawcę.
- **Admin** (`/admin/livekit`) ma oversight z dual-mode dołączenia
  (embedded subscriber lub QR scan).
- **Mobile** (upload-bridge `/livestream`) = publisher (przez QR scan).
- **Serwisant** = brak dostępu (już zrobione w `dff5a734`).

## Diagram flow (QR + Chatwoot agent paths)

```
┌────────────────────────────────────────────────────────────┐
│              POST /api/livekit/start-publisher              │
│  (sprzedawca panel, KC auth via panel relay)                │
│                                                              │
│  → createRoom + createMobilePublisherToken                  │
│  → buildMobilePublisherUrl + generateQrDataUrl              │
│  → signJoinToken (audience mp-consultation-join)            │
│  → sendPrivateNote (Chatwoot conv) z mobileUrl + joinUrl    │
│                                                              │
│  Response: { roomName, mobilePublisherUrl, qrCodeDataUrl,   │
│              joinToken, joinUrl, livekitUrl, expiresAt }    │
└────────────────────────────────────────────────────────────┘
              │                                      │
              ▼                                      ▼
   Sprzedawca panel UI                   Chatwoot Dashboard App
   (ConsultationVideoSection)            (IntakePreviewClient)
   - render QR + mobileUrl                 - polling rooms-for-service
   - polling room-status co 5s             - inline JoinModeSelector
   - "Zakończ" → end-room                  - dla sprzedawca-initiated:
                                             agent-join-token automatyczny

   QR skanuje                              Agent może też
   ▼ telefon klienta                       ▼ zainicjować sam:
┌────────────────────────────────┐  ┌────────────────────────────────┐
│ upload-bridge /livestream      │  │ POST /api/livekit/start-       │
│ ?room=X&token=Y                │  │      from-chatwoot-agent       │
│                                │  │ (auth: initiateToken           │
│ - getUserMedia probe           │  │  z intake-snapshot)            │
│ - room.connect(NEXT_PUBLIC_    │  │                                │
│   LIVEKIT_URL, token)          │  │ Owns room (chatwoot:conv:N)    │
│ - setCameraEnabled (back)      │  └────────────────────────────────┘
│ - setMicrophoneEnabled         │
│ - mobile UI: switch/mute/end   │
└────────────────────────────────┘
```

## Trzy ścieżki inicjacji

| Inicjator         | Endpoint                                       | Auth                                        | `requested_by_email`            |
| ----------------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------- |
| Sprzedawca panel  | `POST /api/livekit/start-publisher`            | KC OIDC (panel relay → Bearer accessToken)  | `<user.email>`                  |
| Chatwoot agent    | `POST /api/livekit/start-from-chatwoot-agent`  | `initiateToken` (HS256, 5 min, scoped)      | `chatwoot:conv:<id>` lub `chatwoot:service:<sid>` |
| Admin oversight   | (nie inicjuje — tylko dołącza/kończy)          | KC OIDC + `requireInfrastructure`           | n/a                             |

`requested_by_email` namespace per-conversation jest celowy. `mp_livekit_sessions`
ma partial unique index `WHERE status IN ('waiting','active')` — gwarantuje
maksymalnie 1 aktywny pokój per `requested_by_email`. Bez namespace, agent
Chatwoot inicjujący w konwersacji A blokowałby agenta inicjującego w
konwersacji B (gdyby oboje używali tego samego email'a). Z namespace każda
konwersacja ma własny "slot".

## Trzy rodzaje tokenów

| Token                 | Mechanizm     | Audience                  | TTL    | Wystawiany przez             | Konsumowany przez                                 |
| --------------------- | ------------- | ------------------------- | ------ | ---------------------------- | ------------------------------------------------- |
| Mobile publisher      | LiveKit JWT   | n/a (LiveKit access)      | 30 min | start-publisher / start-from-chatwoot-agent | upload-bridge `/livestream` (publisher track) |
| Signed join token     | HS256 (jose)  | `mp-consultation-join`    | 30 min | start-publisher / admin-join-token / agent-join-token | join-token endpoint → wystawia subscriber LiveKit JWT |
| Chatwoot initiate     | HS256 (jose)  | `mp-chatwoot-initiate`    | 5 min  | intake-snapshot              | start-from-chatwoot-agent + agent-join-token      |

Wszystkie trzy używają tego samego `LIVEKIT_API_SECRET` ale audience-scoped —
JWT mintowany dla jednego celu nie zostanie zaakceptowany przez weryfikator
innego celu.

## Endpoints (Wave 23 overlay)

### Publiczne (CORS `*`)

- `GET /api/livekit/intake-snapshot?service_id=…` — sanitized intake
  snapshot + `initiateToken` (gdy LiveKit skonfigurowany).
- `GET /api/livekit/room-status?room=X&token=Y` — polling status pokoju.
  Auth = signed join token, `claims.room === query.room`.
- `GET /api/livekit/rooms-for-service?service_id=…` — aktywne pokoje
  per service / conversation. Sanitized metadata.
- `POST /api/livekit/start-from-chatwoot-agent` — Chatwoot agent
  inicjuje rozmowę. Auth = `initiateToken`.
- `POST /api/livekit/agent-join-token` — Chatwoot agent prosi o signed
  join token dla istniejącego pokoju. Auth = `initiateToken` z
  cross-service guard (`session.serviceId === claims.serviceId`).
- `GET /api/livekit/join-token?token=…` — wystawia LiveKit subscriber
  token (z signed join tokenu).

### Auth wymagana

- `POST /api/livekit/start-publisher` — KC OIDC (panel relay).
- `POST /api/livekit/end-room` — KC OIDC, ownership po `requested_by_email`.
- `POST /api/admin/livekit/admin-join-token` — `requireInfrastructure`.
- `POST /api/admin/livekit/end-room` — `requireInfrastructure`.
- `GET /api/admin/livekit/rooms` — `requireInfrastructure`.

## UI

- `panels/sprzedawca/components/intake/ConsultationVideoSection.tsx`
  — QR-only (browser camera usunięta).
- `components/livekit/JoinModeSelector.tsx` — reusable: tabs "Dołącz tutaj"
  / "Skanuj QR". Lazy `livekit-client` + `qrcode` browser dynamic
  imports.
- `app/admin/livekit/LivekitAdminClient.tsx` — inline expand z
  JoinModeSelector zamiast otwierania `/konsultacja/<room>` w nowej
  karcie.
- `app/chatwoot-app/intake-preview/IntakePreviewClient.tsx` — sekcja
  "Konsultacja video" z polling `/api/livekit/rooms-for-service`,
  inline initiate button + auto-fetch agent-join-token dla istniejących
  pokoi.

## Zmienne środowiska

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — bez zmian od
  Wave 22 / F16.
- `NEXT_PUBLIC_LIVEKIT_URL` — czytany przez upload-bridge przy buildzie
  (inlined w client bundle).
- `UPLOAD_BRIDGE_URL` (nowe, opcjonalne) — base URL dla mobile publisher
  PWA. Default: `https://upload.myperformance.pl`. W dev ustaw na
  `http://localhost:<port>` żeby QR pokazywał lokalny upload-bridge.
- `NEXT_PUBLIC_APP_URL` — bez zmian (używany do `buildJoinUrl`).
- `CHATWOOT_API_TOKEN`, `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID` —
  bez zmian od Wave 22 (sendPrivateNote).

## Co zostało zachowane (uwaga przy cleanup)

- `lib/livekit.ts::createBrowserPublisherToken` — pozostaje exportowany
  (mimo że sprzedawca panel już go nie używa). Jest objęty unit testem
  `lib/__tests__/livekit.test.ts` i może wrócić do użycia w przyszłej
  iteracji (np. dodatkowy "agent kamera ON" tryb w embedded subscriber).
  Usunięcie wymaga jednoczesnej zmiany testu.
- `lib/livekit.ts::createPublisherToken` (pre-Wave 23) — mobile-only
  publisher. Pozostaje jako alias semantyczny do mobile publisher;
  `createMobilePublisherToken` jest preferowany dla nowego kodu.

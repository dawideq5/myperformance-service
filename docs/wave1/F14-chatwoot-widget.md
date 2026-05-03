# F14 — Chatwoot floating widget w panelu sprzedawcy

**Wave:** 22 / Wave 3
**Branch:** `wave3/f14-chatwoot-widget` (parent: `wave1/foundations`)
**Status:** Implemented (panel-side); wymaga konfiguracji po stronie Chatwoot inbox.

## Cel

Sprzedawca przyjmujący urządzenie na serwis potrzebuje skonsultować np.
wycenę, dostępność części lub zasadność reklamacji z serwisantem. Klika
floating widget Chatwoot (bottom-right), system łączy z agentami inboxa
`Panel Sprzedawcy`, a po stronie agenta widoczny jest pełny kontekst:
identyfikacja sprzedawcy + custom attributes z aktualnie otwartego
zlecenia.

## Co zostało dodane (panel-side)

| Plik | Zawartość |
|---|---|
| `panels/sprzedawca/components/ChatwootWidget.tsx` | Floating widget — wstrzykuje SDK script, wywołuje `setUser` z `identifier_hash`, ustawia locale `pl`, taguje konwersację `service-consultation`. |
| `panels/sprzedawca/app/api/chatwoot/identity/route.ts` | Server endpoint zwracający `{ identifier, hash, email, name }`. Hash = HMAC-SHA256 emaila secretem `CHATWOOT_USER_HASH_SECRET`. |
| `panels/sprzedawca/types/chatwoot.d.ts` | TypeScript types dla `window.chatwootSDK` + `window.$chatwoot` + event `chatwoot:ready`. |
| `panels/sprzedawca/app/layout.tsx` | Mount `<ChatwootWidget />` w body — komponent sam gateuje na `useSession() === "authenticated"`. |
| `panels/sprzedawca/components/serwis/ServiceDetailView.tsx` | `useEffect` ustawiający custom attributes (service_id, ticket_number, brand, model, contact email, location id, status) gdy widok zlecenia jest otwarty; cleanup usuwa atrybuty po opuszczeniu widoku. |

## Configuration

### Environment variables

| Var | Scope | Default | Komentarz |
|---|---|---|---|
| `NEXT_PUBLIC_CHATWOOT_BASE_URL` | client | `https://chat.myperformance.pl` | Public base URL Chatwoot. |
| `NEXT_PUBLIC_CHATWOOT_SPRZEDAWCA_WEBSITE_TOKEN` | client | `fpRgZiQqZzqgdmMeCRGsr4uX` | Website token z Chatwoot inbox (Settings > Configuration > Code Snippet). Default to wartość ze snippeta dostarczonego przez usera. |
| `CHATWOOT_USER_HASH_SECRET` | server | _(unset)_ | HMAC token z Chatwoot inbox > Configuration > Identity validation. **Bez tego setUser pójdzie bez `identifier_hash` i Chatwoot odrzuci wywołanie jeśli inbox ma "Enable identity validation = ON".** |

### Po stronie Chatwoot (operacyjne — NIE w kodzie)

1. **Identity validation** (Inbox > Settings > Configuration > Identity validation):
   - Włącz `Enable identity validation`.
   - Skopiuj wygenerowany HMAC token i wklej go do Coolify env panelu sprzedawcy jako `CHATWOOT_USER_HASH_SECRET`.
2. **Auto Assignment** (Inbox > Settings > Collaborators):
   - Wybierz `Auto-assign conversations` = `Enabled`.
   - Dodaj jako `Collaborators` agentów z rolą serwisanta z uprawnieniem do tej skrzynki.
   - Chatwoot przydzieli każdą nową konwersację do dyżurnego serwisanta — sprzedawca nie musi nic wybierać.
3. **Tag interpretation** (opcjonalne):
   - Reguła `Automation` (Conversation Created > Add Label `service-consultation`) jest niepotrzebna — widget sam wywołuje `setLabel("service-consultation")` po `chatwoot:ready`.
4. **Custom attributes interpretation** (Settings > Custom Attributes):
   - Dodaj atrybuty contact-level (typ `Text`):
     - `service_id`, `ticket_number`, `service_status`, `brand`, `model`, `customer_email`, `location_id`, `service_location_id`.
   - Bez wcześniejszego zarejestrowania atrybut przyjdzie, ale UI Chatwoot pokaże go jako "ad-hoc". Rejestracja powoduje, że widać je w panelu agenta jako pola z labelem.

## Identifier hash flow

```
Browser                           Panel API                         Chatwoot
  │                                  │                                 │
  ├─ GET /api/chatwoot/identity ─────▶                                 │
  │                                  │  HMAC-SHA256(email, secret)     │
  │◀─ { identifier, hash, ... } ─────┤                                 │
  │                                  │                                 │
  ├─ load /packs/js/sdk.js ─────────────────────────────────────────────▶
  │◀── chatwoot:ready event ───────────────────────────────────────────┤
  │                                                                    │
  ├─ $chatwoot.setUser(email, { ..., identifier_hash }) ───────────────▶
  │                                                                    │  walidacja:
  │                                                                    │  HMAC(email, secret) === hash?
  │                                                                    │  ✓ → kontakt zidentyfikowany
  │                                                                    │  ✗ → 401, setUser rejected
```

`CHATWOOT_USER_HASH_SECRET` MUSI być identyczny z HMAC tokenem
skonfigurowanym w Chatwoot inbox. Niezgodność = każdy setUser odrzucony.

Jeśli secret nie jest ustawiony w env, endpoint zwraca `{ hash: null }`
i widget wywołuje setUser bez `identifier_hash`. Chatwoot zaakceptuje
wywołanie tylko jeśli inbox ma identity validation wyłączone — to jest
świadoma graceful degradation, NIE bug.

## SDK ready timing

`window.$chatwoot` jest `undefined` do momentu pełnej inicjalizacji
SDK. Komponent obsługuje 3 ścieżki:

1. **Pierwsze załadowanie:** subskrybuje `chatwoot:ready` listener, w
   handlerze wywołuje `setUser` + `setLocale` + `setLabel`.
2. **Soft re-mount (po nawigacji w panelu):** jeśli
   `window.$chatwoot.hasLoaded === true`, wywołuje od razu (bez
   czekania na event który już dawno przeleciał).
3. **Cleanup unmount:** odpina listener `chatwoot:ready`, NIE odpina
   skryptu SDK (Chatwoot trzyma stan w singletonie — usunięcie
   skryptu i ponowne wstrzyknięcie generuje duplikat websocket/iframe).

`run()` jest idempotentny dla tego samego `websiteToken` — drugie
wywołanie jest no-op.

## Service context — contact-level vs conversation-level

`setCustomAttributes(attrs)` ustawia atrybuty na poziomie KONTAKTU
(sprzedawcy), nie konwersacji. Między sesjami atrybuty są nadpisywane.
Dla naszego use-case to akceptowalne — zawsze chcemy wiedzieć "co
sprzedawca AKTUALNIE ogląda".

`setConversationCustomAttributes(attrs)` (Chatwoot v3+) trzyma atrybuty
przy konkretnym threadzie. ServiceDetailView preferuje to API jeśli
SDK je wystawia (`typeof === "function"`), w przeciwnym razie fallback
na contact-level.

Cleanup po opuszczeniu widoku zlecenia wywołuje `deleteCustomAttribute`
(lub conversation-variant) dla każdego klucza — żeby serwisant w
nowej konwersacji bez kontekstu nie widział starego ticketa.

## Routing — agent assignment

Routing nie jest w kodzie. Konfigurowany po stronie Chatwoot inbox:

- **Auto Assignment** = `Enabled`
- **Collaborators** = lista agentów z rolą serwisanta uprawnionego do
  tej skrzynki

Każda nowa konwersacja zostaje przypisana do dyżurnego serwisanta
zgodnie z load-balancing'iem Chatwoot.

Tag `service-consultation` ustawiany przez widget w `setLabel` może
być użyty w `Automation` rules (np. Webhook do Slacka, priority bump),
ale samego routing'u NIE zmieniamy programowo.

## Position widget

Default Chatwoot Website SDK pozycjonuje widget bottom-right. Zadanie
mówiło o "top-right" — Chatwoot SDK nie wystawia natywnego override'u
pozycji top-right (`position` config przyjmuje `left | right`, zawsze
bottom). Pozostawiamy default — przepychanie do top-right wymagałoby
custom CSS w `chatwoot:ready` injection'em do iframe contentu, co
łamie się przy każdym update'cie SDK.

## Testing checklist (manualne)

- [ ] Dev: `cd panels/sprzedawca && npm run dev` (3001 z DEV_CERT_BYPASS).
- [ ] Login jako sprzedawca → widget pojawia się bottom-right.
- [ ] Otwórz dowolne zlecenie → w Chatwoot agent panel sprawdź, czy
      kontakt ma custom attributes `service_id`, `ticket_number`, etc.
- [ ] Wróć do listy → atrybuty kasują się (visible w Chatwoot dopiero
      po następnej wiadomości od sprzedawcy).
- [ ] Sprawdź Chatwoot inbox: nowa konwersacja przypisana do
      serwisanta, label `service-consultation` przyklejony.
- [ ] Logout → widget znika z `/login` i `/forbidden`.
- [ ] DevTools Network: `GET /api/chatwoot/identity` zwraca `{ hash: <64hex> }`
      (z secretem) lub `{ hash: null }` (bez secretu).

## Changelog

- **2026-05-03** — Initial implementation (Wave 22 / F14).

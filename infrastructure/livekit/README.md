# LiveKit — self-hosted WebRTC SFU dla live device view

`livekit.myperformance.pl` — signaling + REST + media (WebRTC SFU).
Używany przez Wave 22 / F16 (live device view): sprzedawca-mobile streamuje
z aparatu telefonu (publisher), serwisant ogląda w panelu (subscriber).

## Komponenty

- **LiveKit server** — ten compose; signaling (WSS) + REST API na 7880,
  TCP fallback 7881, media UDP 50000-60000.
- **coturn** — `infrastructure/coturn/` — TURN/STUN dla NAT traversal
  (klienci za symmetric NAT-em korzystają z relay TURN).
- **lib/livekit.ts** (F16b, w dashboardzie) — token issuer (publisher /
  subscriber tokens podpisane parą `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`).
- **apps/upload-bridge** (F16c) — mobile PWA publisher (getUserMedia + LiveKit JS SDK).
- **panels/serwisant** (F16d) — subscriber UI (LiveKit React SDK).

## Architektura sieci

```
                      Internet
                         |
     +-------------------+--------------------+
     |                                        |
  Traefik (TLS, :443)               coturn (host network)
     |                                        |
     | livekit.myperformance.pl              | UDP 3478, TCP 5349
     |    /rtc → ws upgrade                   | + relay range 49160-49200/udp
     v                                        |
  livekit container                          (kontakt klient ↔ TURN)
   :7880  (signaling/REST/HTTP)
   :7881  (TCP media fallback, host port)
   :50000-60000/udp (host port range, media)

   Po negocjacji ICE:
   client ↔ livekit  (UDP direct, gdy brak NAT-a)
   client ↔ coturn ↔ livekit  (relay TURN, gdy symmetric NAT)
```

## DNS (OVH)

Przed deployem dodaj w OVH (strefa `myperformance.pl`):

| Type | Name | Value |
| --- | --- | --- |
| A | `livekit.myperformance.pl` | `<VPS public IPv4>` |
| A | `turn.myperformance.pl` | `<VPS public IPv4>` |

(opcjonalnie AAAA dla IPv6 — LiveKit/coturn wspierają, ale wymaga dodatkowej
konfiguracji `external-ip` w turnserver.conf).

TTL: 300 (krótki przy pierwszym deployu, na czas zmian; potem 3600).

## Wymagane env-vary (Coolify Service envs)

| Klucz | Wartość | Uwagi |
| --- | --- | --- |
| `LIVEKIT_API_KEY` | Random 16 znaków alfanumerycznych | Patrz „Generowanie kluczy" |
| `LIVEKIT_API_SECRET` | Random 32+ znaków, base64 | Sekret HS256 do JWT |
| `LIVEKIT_TURN_DOMAIN` | `turn.myperformance.pl` | Default |
| `LIVEKIT_TURN_USER` | `livekit` | Współdzielone z coturnem |
| `LIVEKIT_TURN_PASSWORD` | Random 32+ chars, base64 | Współdzielone z coturnem |
| `LIVEKIT_NODE_IP` | Public IPv4 VPS | Optional — bez tego LiveKit pyta STUN |

> Te same `LIVEKIT_API_KEY`/`SECRET` MUSZĄ trafić do envów dashboardu —
> `lib/livekit.ts` (F16b) używa ich do podpisu access tokenów. Patrz
> `.env.example` w repo.

### Env mapping na YAML config

LiveKit czyta env-vary z prefiksem `LIVEKIT_*` i mapuje je na ścieżki w
`livekit.yaml` (dot-notation w nazwie env-vara, np. `LIVEKIT_RTC_NODE_IP`
→ `rtc.node_ip`). W naszym compose używamy:

| Env var | YAML path | Powód użycia env zamiast YAML |
| --- | --- | --- |
| `LIVEKIT_KEYS` | `keys` | LiveKit NIE substituuje `${VAR}` w YAML keys (substitution działa tylko w wartościach skalarnych). Format: `"<key>: <secret>"`. Compose interpoluje z `${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}`. |
| `LIVEKIT_RTC_NODE_IP` | `rtc.node_ip` | Override `use_external_ip`. Pusty = STUN auto-detect. |

## Generowanie kluczy

LiveKit nie ma własnego generatora w obrazie — używamy openssl/uuidgen:

```bash
# API key — krótki, czytelny ID (np. APIxxxxxxxxxxxxxxxx)
echo "API$(openssl rand -hex 8)"

# API secret — silny sekret (HS256 wymaga >=32 bajtów, base64-safe)
openssl rand -base64 48 | tr -d '/+=' | cut -c1-48

# TURN credentials
echo "livekit"
openssl rand -base64 48 | tr -d '/+=' | cut -c1-32
```

Zapisz w bezpiecznym miejscu (1Password / Bitwarden) — sekret jest „write-once",
po wpisaniu do Coolify nie da się go odzyskać (tylko zresetować, co inwaliduje
wszystkie wystawione tokeny).

## Deployment (Coolify)

1. **DNS** — najpierw rekordy A jak wyżej (cache LE).
2. **Coolify → New Resource → Service → Docker Compose** — wklej zawartość
   `docker-compose.yml`.
3. **Domains → Add `livekit.myperformance.pl`** — Coolify wygeneruje
   automatycznie router HTTPS + cert Let's Encrypt.
4. **Environment Variables** — wklej wszystkie z tabeli wyżej.
5. **livekit.yaml** — Coolify nie kopiuje plików spoza compose'a; ten plik
   trzeba załadować jako *config-init* (sidecar `alpine` z heredocem) ALBO
   przez Coolify *Persistent Volumes → Bind mount* z `/opt/myperformance/livekit/livekit.yaml`.
   Dla v1: bind mount przez SSH:
   ```bash
   ssh root@<vps>
   mkdir -p /opt/myperformance/livekit
   cd /opt/myperformance/livekit
   curl -fsS https://raw.githubusercontent.com/<repo>/<branch>/infrastructure/livekit/livekit.yaml -o livekit.yaml
   ```
   I w compose podmień `./livekit.yaml` na `/opt/myperformance/livekit/livekit.yaml`.
6. **Deploy** — start serwis. Obserwuj logi: oczekiwany output:
   ```
   {"level":"info","msg":"starting LiveKit server","version":"1.8.x","node_id":"NE_xxx"}
   {"level":"info","msg":"using TURN server","domain":"turn.myperformance.pl"}
   ```

> **NIE deployuj coturna w tym samym kroku** — coturn potrzebuje
> `network_mode: host` (full UDP relay) i ma osobny compose
> (`infrastructure/coturn/`). Order: LiveKit najpierw, coturn po nim.

## Health check

```bash
# 1. Signaling endpoint (HTTPS upgrade)
curl -sS https://livekit.myperformance.pl/
# Oczekiwany output: "OK"

# 2. WebSocket upgrade (powinno zwrócić 426 Upgrade Required jak nie WS)
curl -isS https://livekit.myperformance.pl/rtc | head -1
# Oczekiwany: HTTP/2 426

# 3. Wewnątrz docker network — Prometheus metrics
docker exec <livekit-container> wget -qO- http://127.0.0.1:6789/metrics | head
```

## Smoke test (oficjalny LiveKit Meet)

LiveKit udostępnia `https://meet.livekit.io` jako referencyjny klient.
Ustawienie własnego serwera jako backendu wymaga wygenerowania access tokena
i podanie URL serwera:

1. Wejdź na `https://meet.livekit.io/?tab=custom`.
2. **Server URL**: `wss://livekit.myperformance.pl`
3. **Token**: wygeneruj jednorazowy access token CLI:
   ```bash
   # Wymaga zainstalowanego livekit-cli (https://github.com/livekit/livekit-cli):
   #   brew install livekit-cli
   #   curl -sSL https://get.livekit.io/cli | bash

   livekit-cli token create \
     --api-key   "$LIVEKIT_API_KEY" \
     --api-secret "$LIVEKIT_API_SECRET" \
     --identity  "smoke-test" \
     --room      "smoke-test-$(date +%s)" \
     --join \
     --valid-for 1h
   ```
   Skopiuj wyplutą wartość (string JWT).
4. **Connect** — kamera/mic powinny się połączyć w ciągu 3-5 s.
5. Otwórz drugą zakładkę z innym `--identity` ale tym samym `--room` —
   powinien być widoczny remote feed.
6. Zamknij. Po 30 min idle (`empty_timeout`) room zostanie sprzątnięty.

## Troubleshooting

- **`404 Not Found` z Traefika** — DNS nie wskazuje na VPS lub Coolify nie
  dograł routera. Sprawdź `traefik.http.routers.livekit-*` w `docker inspect`.
- **WebSocket disconnect z błędem `1006`** — coturn nieosiągalny
  (UDP 3478/5349 zablokowany w firewallu VPS-a). Sprawdź `iptables -L` /
  `ufw status` i upewnij się, że oba porty + relay range są ALLOW.
- **`ICE connection failed` w przeglądarce** — `LIVEKIT_NODE_IP` zwraca
  prywatny adres (172.x). Wpisz public IPv4 ręcznie w Coolify env-vars.
- **Kandydaty ICE z portem `0`** — `port_range_start/end` w livekit.yaml
  nie zgadza się z `ports:` w docker-compose. MUSI być identyczny zakres.
- **Wszystko działa lokalnie, padło po `Coolify Redeploy`** — Coolify
  recreate'uje kontenery. UDP host port mapping jest re-aplikowane, ale
  jeśli port był zajęty (poprzedni kontener nie zdążył zwolnić) — restart
  hosta lub `docker network prune`.

## Capacity planning

LiveKit SFU forwarduje pakiety bez transcoding'u, więc CPU/pamięć rośnie
głównie z liczbą równoczesnych tracks (publisher streams). Dla naszego
use case'a (1 publisher mobile + 1-2 subscriberów na jeden device-view
session, max ~5 równoległych sesji):

- **CPU**: 0.5-1 core wystarczy
- **RAM**: 512 MB-1 GB
- **Bandwidth**: 1-2 Mbps per stream → 5-10 Mbps łącznie

Limit `cpus: 2 / memory: 2G` w compose jest hojny, da margines na
peak (np. szkolenie z 10 uczestnikami).

## Powiązane

- [`infrastructure/coturn/README.md`](../coturn/README.md) — TURN setup
- F16b: `lib/livekit.ts` (token issuer) — w branchu `wave2/f16b-livekit-tokens`
- F16c: `apps/upload-bridge/app/livestream/page.tsx` (mobile publisher)
- F16d: `panels/serwisant/components/LiveDeviceViewer.tsx` (subscriber UI)
- LiveKit docs: https://docs.livekit.io/realtime/
